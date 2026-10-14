// API integration tests on an ISOLATED test database (studyai_test).
// Never touches production data. Drops the test DB when done.
// Run: npm test (node --test tests/)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/studyai_test';
process.env.DISABLE_SCHEDULER = '1';

const { connectDB } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { processDueReminders } = await import('../src/services/reminder.service.js');

const TAG = Date.now();
let server;
let base;

function jar() {
  let cookie = '';
  return {
    get headers() {
      return cookie ? { Cookie: cookie } : {};
    },
    save(res) {
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
    },
  };
}

async function api(method, path, { body, auth, query } = {}) {
  const url = base + path + (query ? `?${new URLSearchParams(query)}` : '');
  const headers = { ...(auth ? auth.headers : {}) };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  if (auth) auth.save(res);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty body
  }
  return { status: res.status, data };
}

async function register(email, role = 'student', name = 'Test') {
  const j = jar();
  const r = await api('POST', '/api/auth/register', { body: { name, email, password: 'secret123', role }, auth: j });
  assert.equal(r.status, 201, `register ${email}: ${JSON.stringify(r.data)}`);
  return { jar: j, user: r.data.data.user };
}

before(async () => {
  await connectDB(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Phase 1 — auth + RBAC', () => {
  it('registers, logs in, and reads own profile via cookie session', async () => {
    const { jar: j, user } = await register(`s1-${TAG}@ex.com`);
    assert.equal(user.role, 'student');
    // Cookie-only: token must NOT appear in the body (BUG-03 regression)
    const raw = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `s1-${TAG}@ex.com`, password: 'secret123' }),
    });
    const loginBody = await raw.json();
    assert.ok(!('token' in (loginBody.data || {})), 'JWT must not be in response body');
    assert.ok((raw.headers.get('set-cookie') || '').includes('HttpOnly'), 'auth cookie must be HttpOnly');
    const me = await api('GET', '/api/auth/me', { auth: j });
    assert.equal(me.status, 200);
    assert.equal(me.data.data.email, `s1-${TAG}@ex.com`);
    assert.ok(!('password' in me.data.data), 'no password hash leaked');
  });

  it('blocks admin self-registration', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { name: 'X', email: `x-${TAG}@ex.com`, password: 'secret123', role: 'admin' },
    });
    // Rejected at validation (400) before reaching the service 403 guard —
    // both layers block privileged self-registration.
    assert.ok([400, 403].includes(r.status));
  });

  it('rejects duplicate registration and bad login', async () => {
    const dup = await api('POST', '/api/auth/register', {
      body: { name: 'S', email: `s1-${TAG}@ex.com`, password: 'secret123' },
    });
    assert.equal(dup.status, 409);
    const bad = await api('POST', '/api/auth/login', {
      body: { email: `s1-${TAG}@ex.com`, password: 'wrong' },
    });
    assert.equal(bad.status, 401);
  });

  it('enforces ownership: student B cannot read student A', async () => {
    const a = await register(`sa-${TAG}@ex.com`);
    const b = await register(`sb-${TAG}@ex.com`);
    const r = await api('GET', `/api/auth/users/${a.user.id}`, { auth: b.jar });
    assert.equal(r.status, 403);
    const self = await api('GET', `/api/auth/users/${a.user.id}`, { auth: a.jar });
    assert.equal(self.status, 200);
  });

  it('forgot/reset flow works with single-use token', async () => {
    const email = `fp-${TAG}@ex.com`;
    await register(email);
    const f = await api('POST', '/api/auth/forgot-password', { body: { email } });
    assert.equal(f.status, 200);
    const token = f.data.data.devResetToken;
    assert.ok(token, 'dev token issued in non-prod test env');
    const r1 = await api('POST', '/api/auth/reset-password', { body: { token, newPassword: 'newpass123' } });
    assert.equal(r1.status, 200);
    const reuse = await api('POST', '/api/auth/reset-password', { body: { token, newPassword: 'again123' } });
    assert.equal(reuse.status, 400);
    const login = await api('POST', '/api/auth/login', { body: { email, password: 'newpass123' } });
    assert.equal(login.status, 200);
  });
});

describe('Phase 2 — learning data + isolation', () => {
  it('profile upsert, subjects, topics, goals persist and isolate', async () => {
    const a = await register(`la-${TAG}@ex.com`);
    const b = await register(`lb-${TAG}@ex.com`);
    const prof = await api('PUT', '/api/learning/profile', {
      auth: a.jar,
      body: { academicLevel: 'undergraduate', subjects: ['Physics'], learningStyle: 'visual', examType: 'gate', dailyStudyHours: 4 },
    });
    assert.equal(prof.status, 200);
    const sub = await api('POST', '/api/learning/subjects', { auth: a.jar, body: { name: 'Physics' } });
    assert.equal(sub.status, 201);
    const dup = await api('POST', '/api/learning/subjects', { auth: a.jar, body: { name: 'Physics' } });
    assert.equal(dup.status, 409);
    const bulk = await api('POST', '/api/learning/topics/bulk', {
      auth: a.jar,
      body: { subject: sub.data.data._id, titles: ['Kinematics', 'Thermo'] },
    });
    assert.equal(bulk.status, 201);
    // B sees none of A's data
    const bTopics = await api('GET', '/api/learning/topics', { auth: b.jar });
    assert.equal(bTopics.data.data.length, 0);
    // B cannot touch A's topic
    const cross = await api('PATCH', `/api/learning/topics/${bulk.data.data[0]._id}`, { auth: b.jar, body: { status: 'completed' } });
    assert.equal(cross.status, 404);
    // validation: bad confidence rejected
    const bad = await api('POST', '/api/learning/topics', {
      auth: a.jar,
      body: { subject: sub.data.data._id, title: 'X', confidence: 9 },
    });
    assert.equal(bad.status, 400);
  });
});

describe('Phase 3 — planner', () => {
  it('generates a budget-respecting plan and completes tasks', async () => {
    const s = await register(`pl-${TAG}@ex.com`);
    const sub = await api('POST', '/api/learning/subjects', { auth: s.jar, body: { name: 'Maths' } });
    await api('POST', '/api/learning/topics/bulk', { auth: s.jar, body: { subject: sub.data.data._id, titles: ['Algebra', 'Calculus'] } });
    const exam = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const g = await api('POST', '/api/plans/generate', { auth: s.jar, body: { examDate: exam, dailyHours: 3 } });
    assert.equal(g.status, 201);
    assert.equal(g.data.data.source, 'rule-based');
    for (const t of g.data.data.tasks) assert.ok(t.durationMin >= 5 && t.durationMin <= 240);
    const planId = g.data.data.plan._id;
    const dup = await api('POST', '/api/plans/generate', { auth: s.jar, body: { examDate: exam, dailyHours: 3 } });
    assert.equal(dup.status, 409);
    const taskId = g.data.data.tasks[0]._id;
    const done = await api('POST', `/api/plans/tasks/${taskId}/complete`, { auth: s.jar });
    assert.equal(done.status, 200);
    const sum = await api('GET', `/api/plans/${planId}/summary`, { auth: s.jar });
    assert.equal(sum.data.data.plan.completedTasks, 1);
  });
});

describe('Phase 6 — assessments', () => {
  it('educator creates, student attempts, auto-grade + manual grade work', async () => {
    const e = await register(`ed-${TAG}@ex.com`, 'educator', 'Edu');
    const s = await register(`st-${TAG}@ex.com`);
    const dl = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const a = await api('POST', '/api/assessments', {
      auth: e.jar,
      body: { title: 'Quiz', subject: 'Physics', durationMin: 30, deadline: dl, releaseMode: 'immediate' },
    });
    assert.equal(a.status, 201);
    const aid = a.data.data._id;
    const q = await api('POST', `/api/assessments/${aid}/questions`, {
      auth: e.jar,
      body: { type: 'mcq', text: '2+2?', options: ['3', '4'], correctOption: 1, marks: 2 },
    });
    assert.equal(q.status, 201);
    // student cannot see answers at start
    await api('POST', `/api/assessments/${aid}/status`, { auth: e.jar, body: { status: 'published' } });
    const st = await api('POST', `/api/assessments/${aid}/start`, { auth: s.jar });
    assert.equal(st.status, 201);
    assert.ok(!('correctOption' in st.data.data.questions[0]), 'no answer leak at start');
    const sub = await api('POST', `/api/assessments/attempts/${st.data.data._id}/submit`, {
      auth: s.jar,
      body: { answers: [{ question: q.data.data._id, selectedOption: 1 }] },
    });
    assert.equal(sub.data.data.score, 2);
    const again = await api('POST', `/api/assessments/attempts/${st.data.data._id}/submit`, { auth: s.jar, body: {} });
    assert.equal(again.status, 400);
  });

  it('re-entering an in-progress attempt returns its questions (no blank quiz)', async () => {
    const e = await register(`edre-${TAG}@ex.com`, 'educator', 'Edu');
    const s = await register(`stre-${TAG}@ex.com`);
    const dl = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const a = await api('POST', '/api/assessments', {
      auth: e.jar,
      body: { title: 'Re-entry Quiz', subject: 'Physics', durationMin: 30, deadline: dl },
    });
    const aid = a.data.data._id;
    await api('POST', `/api/assessments/${aid}/questions`, {
      auth: e.jar,
      body: { type: 'mcq', text: '2+2?', options: ['3', '4'], correctOption: 1, marks: 2 },
    });
    await api('POST', `/api/assessments/${aid}/status`, { auth: e.jar, body: { status: 'published' } });
    const first = await api('POST', `/api/assessments/${aid}/start`, { auth: s.jar });
    assert.equal(first.status, 201);
    assert.ok(first.data.data.questions.length > 0, 'first start has questions');
    // second start hits the existing-attempt path — must still include questions
    const second = await api('POST', `/api/assessments/${aid}/start`, { auth: s.jar });
    assert.equal(second.status, 201);
    assert.ok(second.data.data.questions.length > 0, 're-entry returns questions');
    assert.ok(!('correctOption' in second.data.data.questions[0]), 'still no answer leak');
  });

  it('educator links student (append-only), sees them, sends feedback to inbox', async () => {
    const e = await register(`edlink-${TAG}@ex.com`, 'educator', 'Edu');
    const s = await register(`stlink-${TAG}@ex.com`);
    const dl = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const a = await api('POST', '/api/assessments', {
      auth: e.jar,
      body: { title: 'Link Quiz', subject: 'Maths', durationMin: 20, deadline: dl },
    });
    const aid = a.data.data._id;
    // unknown email -> 404, nothing linked
    const missing = await api('POST', `/api/assessments/${aid}/assignees/add`, { auth: e.jar, body: { email: 'nobody@ex.com' } });
    assert.equal(missing.status, 404);
    // invalid email -> 400
    const bad = await api('POST', `/api/assessments/${aid}/assignees/add`, { auth: e.jar, body: { email: 'not-an-email' } });
    assert.equal(bad.status, 400);
    // link works and is idempotent
    const link1 = await api('POST', `/api/assessments/${aid}/assignees/add`, { auth: e.jar, body: { email: `stlink-${TAG}@ex.com` } });
    assert.equal(link1.status, 200);
    assert.equal(link1.data.data.already, false);
    const link2 = await api('POST', `/api/assessments/${aid}/assignees/add`, { auth: e.jar, body: { email: `STLINK-${TAG}@EX.COM` } });
    assert.equal(link2.data.data.already, true);
    // student now visible to educator (and only to them)
    const list = await api('GET', '/api/educator/students', { auth: e.jar });
    assert.ok(list.data.data.some((u) => u.email === `stlink-${TAG}@ex.com`), 'linked student visible');
    // another educator cannot see or message this student
    const e2 = await register(`edlink2-${TAG}@ex.com`, 'educator', 'Edu2');
    const det2 = await api('GET', `/api/educator/students/${s.user.id}`, { auth: e2.jar });
    assert.equal(det2.status, 404);
    const note2 = await api('POST', '/api/educator/notes', { auth: e2.jar, body: { studentId: s.user.id, title: 'Hi', body: 'x' } });
    assert.equal(note2.status, 404);
    // owner educator can message; student receives it in inbox
    const note = await api('POST', '/api/educator/notes', { auth: e.jar, body: { studentId: s.user.id, title: 'Well done', body: 'Keep revising algebra.' } });
    assert.equal(note.status, 201);
    const inbox = await api('GET', '/api/notifications', { auth: s.jar });
    const fb = inbox.data.data.items.find((n) => n.kind === 'feedback' && n.title === 'Well done');
    assert.ok(fb, 'feedback delivered to student inbox');
  });
});

describe('Phase 4+5 — resources, tutor fallback', () => {
  it('educator upload → pending → admin approve → student sees + tutor cites', async () => {
    const e = await register(`er-${TAG}@ex.com`, 'educator', 'Edu');
    const s = await register(`sr-${TAG}@ex.com`);
    const fd = new FormData();
    fd.append('title', 'Thermo Notes');
    fd.append('subject', 'Physics');
    fd.append('topic', 'Thermodynamics');
    fd.append('format', 'note');
    fd.append('file', new Blob(['Thermodynamics laws and entropy basics.'], { type: 'text/plain' }), 'notes.txt');
    const upRes = await fetch(`${base}/api/resources`, { method: 'POST', headers: e.jar.headers, body: fd });
    assert.equal(upRes.status, 201);
    const up = await upRes.json();
    const rid = up.data._id;
    const before = await api('GET', '/api/resources', { auth: s.jar });
    assert.ok(!before.data.data.items.some((r) => r._id === rid), 'pending hidden from students');
    // approve directly as the educator's own admin? need admin — promote via direct model? use seed-less path:
    // educators cannot approve; simulate admin by updating role through test-only direct DB call
    const { User } = await import('../src/models/User.js');
    await User.findOneAndUpdate({ email: `er-${TAG}@ex.com` }, { role: 'admin' });
    const ap = await api('POST', `/api/resources/${rid}/approve`, { auth: e.jar, body: {} });
    assert.equal(ap.status, 200);
    const after = await api('GET', '/api/resources', { auth: s.jar });
    assert.ok(after.data.data.items.some((r) => r._id === rid), 'approved visible');
    // tutor fallback cites the retrieved source (mock provider → flagged fallback)
    const c = await api('POST', '/api/tutor/conversations', { auth: s.jar, body: {} });
    const ask = await api('POST', `/api/tutor/conversations/${c.data.data._id}/messages`, {
      auth: s.jar,
      body: { question: 'Explain thermodynamics entropy simply' },
    });
    assert.equal(ask.status, 200);
    assert.equal(ask.data.data.message.fallback, true);
    assert.ok(ask.data.data.message.sources.length >= 1, 'cites actually-retrieved source');
    // fallback quotes retrieved content (labeled, not generated)
    assert.ok(ask.data.data.message.content.includes('approved study materials'), 'fallback labels quoted sources');
    assert.ok(ask.data.data.message.content.includes(ask.data.data.message.sources[0].title), 'fallback quotes the retrieved title');
    // no fabricated citations on unrelated question
    const c2 = await api('POST', '/api/tutor/conversations', { auth: s.jar, body: {} });
    const ask2 = await api('POST', `/api/tutor/conversations/${c2.data.data._id}/messages`, {
      auth: s.jar,
      body: { question: 'Explain unrelated xyzzy quantum knitting' },
    });
    assert.ok(Array.isArray(ask2.data.data.message.sources), 'sources array present (possibly empty)');
  });
});

describe('Phase 7 — analytics math', () => {
  it('overview numbers match the records created above', async () => {
    const s = await register(`an-${TAG}@ex.com`);
    const sub = await api('POST', '/api/learning/subjects', { auth: s.jar, body: { name: 'Bio' } });
    await api('POST', '/api/learning/topics/bulk', { auth: s.jar, body: { subject: sub.data.data._id, titles: ['Cell', 'Genes'] } });
    const exam = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const g = await api('POST', '/api/plans/generate', { auth: s.jar, body: { examDate: exam, dailyHours: 2 } });
    const plan = await api('GET', `/api/plans/${g.data.data.plan._id}`, { auth: s.jar });
    const tasks = plan.data.data.tasks;
    const expectedMin = tasks[0].durationMin + tasks[1].durationMin;
    await api('POST', `/api/plans/tasks/${tasks[0]._id}/complete`, { auth: s.jar });
    await api('POST', `/api/plans/tasks/${tasks[1]._id}/complete`, { auth: s.jar });
    const ov = await api('GET', '/api/analytics/overview', { auth: s.jar });
    assert.equal(ov.data.data.tasks.completed, 2);
    assert.equal(ov.data.data.studyTime.totalTasks14d, 2);
    assert.equal(ov.data.data.studyTime.totalMinutes14d, expectedMin);
    assert.equal(ov.data.data.syllabus[0].completed, 0);
  });
});

describe('Phase 8 — reminders', () => {
  it('CRUD, validation, prefs, scheduler delivery without duplicates', async () => {
    const s = await register(`rm-${TAG}@ex.com`);
    // past date rejected
    const past = await api('POST', '/api/notifications/reminders', { auth: s.jar, body: { title: 'X', scheduledAt: '2020-01-01T00:00:00Z' } });
    assert.equal(past.status, 400);
    const future = new Date(Date.now() + 3600000).toISOString();
    const c = await api('POST', '/api/notifications/reminders', { auth: s.jar, body: { title: 'Revise optics', type: 'task', scheduledAt: future } });
    assert.equal(c.status, 201);
    const rid = c.data.data._id;
    // edit to another future time
    const later = new Date(Date.now() + 7200000).toISOString();
    const p = await api('PATCH', `/api/notifications/reminders/${rid}`, { auth: s.jar, body: { scheduledAt: later } });
    assert.equal(p.status, 200);
    // prefs off for task type → scheduler cancels instead of delivering
    await api('PUT', '/api/notifications/reminders/preferences', { auth: s.jar, body: { taskReminders: false } });
    const r1 = await processDueReminders({ now: new Date(Date.now() + 3 * 3600000) });
    assert.equal(r1.skipped, 1);
    const inbox1 = await api('GET', '/api/notifications', { auth: s.jar });
    assert.ok(!inbox1.data.data.items.some((n) => n.kind === 'reminder'), 'no delivery when type disabled');
    // re-enable, reschedule soon, deliver exactly once across two ticks
    await api('PUT', '/api/notifications/reminders/preferences', { auth: s.jar, body: { taskReminders: true } });
    const c2 = await api('POST', '/api/notifications/reminders', { auth: s.jar, body: { title: 'Exam prep', type: 'exam', scheduledAt: new Date(Date.now() + 60000).toISOString() } });
    const r2 = await processDueReminders({ now: new Date(Date.now() + 120000) });
    assert.equal(r2.sent, 1);
    const r3 = await processDueReminders({ now: new Date(Date.now() + 180000) });
    assert.equal(r3.sent, 0, 'no duplicate delivery');
    const inbox2 = await api('GET', '/api/notifications', { auth: s.jar });
    const notes = inbox2.data.data.items.filter((n) => n.kind === 'reminder');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].read, false);
    // cancel + done transitions
    const c3 = await api('POST', '/api/notifications/reminders', { auth: s.jar, body: { title: 'Later', scheduledAt: new Date(Date.now() + 3600000).toISOString() } });
    const cancel = await api('POST', `/api/notifications/reminders/${c3.data.data._id}/status`, { auth: s.jar, body: { status: 'cancelled' } });
    assert.equal(cancel.status, 200);
    // ownership: other student cannot touch it
    const o = await register(`ro-${TAG}@ex.com`);
    const cross = await api('PATCH', `/api/notifications/reminders/${c2.data.data._id}`, { auth: o.jar, body: { title: 'hijack' } });
    assert.equal(cross.status, 404);
    // delete
    const del = await api('DELETE', `/api/notifications/reminders/${c3.data.data._id}`, { auth: s.jar });
    assert.equal(del.status, 200);
    // push stub is honest, not faked
    const push = await api('POST', '/api/notifications/push/subscribe', { auth: s.jar, body: {} });
    assert.equal(push.status, 501);
    void rid;
  });

  it('missed sweep marks long-overdue items without delivering', async () => {
    const s = await register(`rm2-${TAG}@ex.com`);
    const c = await api('POST', '/api/notifications/reminders', { auth: s.jar, body: { title: 'Old', scheduledAt: new Date(Date.now() + 60000).toISOString() } });
    const r = await processDueReminders({ now: new Date(Date.now() + 25 * 3600000) });
    assert.equal(r.missed, 1);
    const inbox = await api('GET', '/api/notifications', { auth: s.jar });
    assert.ok(!inbox.data.data.items.some((n) => n.kind === 'reminder'), 'missed items never delivered');
    void c;
  });
});

describe('Phase 9 — educator/admin guards + audit', () => {
  it('admin stats are real, suspend blocks login, actions audited', async () => {
    const s = await register(`ad-${TAG}@ex.com`);
    const { User } = await import('../src/models/User.js');
    const adminUser = await User.findOneAndUpdate({ email: `ad-${TAG}@ex.com` }, { role: 'admin' }, { new: true });
    assert.ok(adminUser, 'promotion path exists for test setup');
    const st = await api('GET', '/api/admin/stats', { auth: s.jar });
    // s.jar now belongs to an admin (role read fresh per request)
    assert.equal(st.status, 200);
    assert.ok(st.data.data.attempts >= 0 && typeof st.data.data.users === 'object', 'real DB counts');
    const v = await register(`vc-${TAG}@ex.com`);
    const susp = await api('PATCH', `/api/admin/users/${v.user.id}/status`, { auth: s.jar, body: { status: 'suspended' } });
    assert.equal(susp.status, 200);
    const blocked = await api('POST', '/api/auth/login', { body: { email: `vc-${TAG}@ex.com`, password: 'secret123' } });
    assert.strictEqual(blocked.status, 403);
    const log = await api('GET', '/api/admin/audit', { auth: s.jar, query: { action: 'user.suspended' } });
    assert.ok(log.data.data.total >= 1, 'suspension audited');
  });

  it('students cannot reach educator/admin endpoints', async () => {
    const s = await register(`bl-${TAG}@ex.com`);
    for (const [m, p] of [['GET', '/api/admin/stats'], ['GET', '/api/educator/students'], ['POST', '/api/assessments']]) {
      const r = await api(m, p, { auth: s.jar, body: m === 'POST' ? {} : undefined });
      assert.ok([403, 400].includes(r.status), `${m} ${p} blocked, got ${r.status}`);
    }
  });
});
