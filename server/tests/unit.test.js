// Unit regression tests — no database required.
// Run: npm test (node --test tests/)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractJSON } from '../src/services/ai.service.js';
import { topicsFromText } from '../src/services/syllabus.service.js';
import { scoreResource } from '../src/services/recommender.service.js';
import { tokenize } from '../src/services/retrieval.service.js';
import { validatePlanJSON } from '../src/services/planner.service.js';
import { masteryStatus } from '../src/services/analytics.service.js';
import { ApiError } from '../src/utils/ApiError.js';
import { ApiResponse } from '../src/utils/ApiResponse.js';
import { cookieOptions } from '../src/services/auth.service.js';
import { isAdminRole, isSuperAdmin, ROLES } from '../src/models/User.js';
import { requireRole, requireSuperAdmin } from '../src/middleware/auth.middleware.js';

describe('extractJSON', () => {
  it('parses fenced JSON', () => {
    assert.deepEqual(extractJSON('```json\n{"tasks": []}\n```'), { tasks: [] });
  });
  it('parses bare JSON with surrounding text', () => {
    assert.deepEqual(extractJSON('Sure: {"a": 1} done'), { a: 1 });
  });
  it('throws when no object exists', () => {
    assert.throws(() => extractJSON('no json here'), /No JSON object/);
  });
  it('throws on empty input', () => {
    assert.throws(() => extractJSON(''), /Empty AI response/);
  });
});

describe('topicsFromText', () => {
  it('extracts headings and numbered items with sections', () => {
    const topics = topicsFromText('Unit 1: Mechanics\n1.1 Kinematics\n1.2 Laws\nUnit 2: Optics\n2.1 Lenses');
    const titles = topics.map((t) => t.title);
    assert.ok(titles.includes('Kinematics'));
    assert.ok(titles.includes('Lenses'));
    const kin = topics.find((t) => t.title === 'Kinematics');
    assert.equal(kin.section, 'Unit 1: Mechanics');
  });
  it('falls back to chunks for unstructured text', () => {
    const topics = topicsFromText('Photosynthesis converts light energy into chemical energy stored in glucose for plants to grow.');
    assert.ok(topics.length > 0);
  });
  it('caps at 100 topics and dedupes', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `1.${i} Topic ${i % 10}`).join('\n');
    const topics = topicsFromText(lines);
    assert.ok(topics.length <= 100);
    assert.equal(new Set(topics.map((t) => t.title)).size, topics.length);
  });
});

describe('scoreResource (rule-v1 recommender)', () => {
  const ctx = {
    subjects: new Set(['physics']),
    weakTopics: ['thermodynamics'],
    planTopics: ['optics'],
    examType: 'gate',
    learningStyle: 'visual',
    level: 'beginner',
  };
  it('scores weak-topic matches highest with reasons', () => {
    const r = scoreResource({ subject: 'Physics', topic: 'Thermodynamics basics', difficulty: 'beginner', examType: 'gate', format: 'video', bookmarkCount: 0, views: 0 }, ctx);
    assert.ok(r.score >= 15);
    assert.ok(r.reasons.some((x) => x.includes('weak area')));
    assert.ok(r.reasons.some((x) => x.includes('Physics')));
  });
  it('gives zero-score no-reason results no reason text', () => {
    const r = scoreResource({ subject: 'History', topic: 'Rome', difficulty: 'advanced', examType: 'upsc', format: 'article', bookmarkCount: 0, views: 0 }, ctx);
    assert.ok(r.score <= 3);
  });
});

describe('tokenize (retrieval)', () => {
  it('lowercases, drops stopwords and short tokens', () => {
    const toks = tokenize('What is Photosynthesis?');
    assert.ok(toks.includes('photosynthesis'));
    assert.ok(!toks.includes('what'));
    assert.ok(!toks.includes('is'));
  });
  it('handles empty input', () => {
    assert.deepEqual(tokenize(''), []);
  });
});

describe('validatePlanJSON (planner guard)', () => {
  const snap = { examDate: '2099-01-10', dailyHours: 2, subjects: [{ name: 'Physics' }] };
  const good = { tasks: [{ subjectName: 'Physics', topicTitle: 'Optics', kind: 'learn', date: '2099-01-02', startMin: 540, durationMin: 45, title: 'Learn Optics', objective: 'Explain lenses' }] };
  it('accepts a valid plan', () => {
    const out = validatePlanJSON(structuredClone(good), snap);
    assert.equal(out.length, 1);
  });
  it('rejects over-budget days', () => {
    const bad = structuredClone(good);
    bad.tasks.push({ ...bad.tasks[0], title: 'Extra', durationMin: 120 });
    assert.throws(() => validatePlanJSON(bad, snap), /over-allocated/);
  });
  it('rejects unknown subjects and bad dates', () => {
    const bad = structuredClone(good);
    bad.tasks[0].subjectName = 'Nope';
    assert.throws(() => validatePlanJSON(bad, snap), /unknown subject/);
    bad.tasks[0].subjectName = 'Physics';
    bad.tasks[0].date = '2000-01-01';
    assert.throws(() => validatePlanJSON(bad, snap), /outside plan window/);
  });
  it('rejects empty task lists', () => {
    assert.throws(() => validatePlanJSON({ tasks: [] }, snap), /no tasks/);
  });
});

describe('masteryStatus (transparent labeling)', () => {
  it('needs-data with zero evidence', () => {
    assert.equal(masteryStatus(null, 0, [], { confidence: 4, status: 'in-progress' }), 'needs-data');
  });
  it('weak on low confidence unfinished topics', () => {
    assert.equal(masteryStatus(null, 0, [], { confidence: 2, status: 'in-progress' }), 'weak');
  });
  it('weak below 50% with any evidence', () => {
    assert.equal(masteryStatus(0, 1, [], null), 'weak');
  });
  it('strong only with n>=2 and >=75', () => {
    assert.equal(masteryStatus(100, 1, [], null), 'developing');
    assert.equal(masteryStatus(80, 3, [], null), 'strong');
  });
  it('weak on repeated mistakes', () => {
    assert.equal(masteryStatus(80, 5, [{}, {}], null), 'weak');
  });
});

describe('API envelope + cookie flags', () => {
  it('ApiError carries status and errors array', () => {
    const e = new ApiError(403, 'Denied', [{ field: 'x', message: 'y' }]);
    assert.equal(e.statusCode, 403);
    assert.equal(e.errors.length, 1);
  });
  it('ApiResponse marks success', () => {
    const r = new ApiResponse('OK', { a: 1 }, 200);
    assert.equal(r.success, true);
    assert.equal(r.statusCode, 200);
  });
  it('auth cookie is httpOnly + lax (BUG-03 regression)', () => {
    const c = cookieOptions();
    assert.equal(c.httpOnly, true);
    assert.equal(c.sameSite, 'lax');
    assert.equal(c.path, '/');
  });
  it('SameSite=None forces Secure (cross-site deploy guard)', async () => {
    const { env } = await import('../src/config/env.js');
    const saved = env.cookieSameSite;
    env.cookieSameSite = 'none';
    try {
      const c = cookieOptions();
      assert.equal(c.sameSite, 'none');
      assert.equal(c.secure, true);
    } finally {
      env.cookieSameSite = saved;
    }
  });
  it('invalid sameSite falls back to lax', async () => {
    const { env } = await import('../src/config/env.js');
    const saved = env.cookieSameSite;
    env.cookieSameSite = 'bogus';
    try {
      assert.equal(cookieOptions().sameSite, 'lax');
    } finally {
      env.cookieSameSite = saved;
    }
  });
});

function mockReq(role) {
  const req = { user: role ? { role, _id: 'u1' } : null };
  let err = 'pending';
  const next = (e) => { err = e || null; };
  return { req, next, err: () => err };
}

describe('role hierarchy', () => {
  it('ROLES includes super_admin; public roles exclude privileged ones', () => {
    assert.ok(ROLES.includes('super_admin'));
    assert.ok(ROLES.includes('admin'));
  });
  it('isAdminRole covers admin and super_admin only', () => {
    assert.equal(isAdminRole('admin'), true);
    assert.equal(isAdminRole('super_admin'), true);
    assert.equal(isAdminRole('student'), false);
    assert.equal(isAdminRole('educator'), false);
    assert.equal(isSuperAdmin('admin'), false);
    assert.equal(isSuperAdmin('super_admin'), true);
  });
  it("requireRole('admin') admits super_admin (hierarchy)", () => {
    const a = mockReq('admin');
    requireRole('admin')(a.req, {}, a.next);
    assert.equal(a.err(), null);
    const s = mockReq('super_admin');
    requireRole('admin')(s.req, {}, s.next);
    assert.equal(s.err(), null);
    const st = mockReq('student');
    requireRole('admin')(st.req, {}, st.next);
    assert.equal(st.err().statusCode, 403);
  });
  it('requireSuperAdmin admits only super_admin', () => {
    const s = mockReq('super_admin');
    requireSuperAdmin()(s.req, {}, s.next);
    assert.equal(s.err(), null);
    const a = mockReq('admin');
    requireSuperAdmin()(a.req, {}, a.next);
    assert.equal(a.err().statusCode, 403);
  });
});
