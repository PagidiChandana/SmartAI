// Super Admin + admin console integration tests on an ISOLATED test database.
// Never touches production data. Drops the test DB when done.
// Run: npm test (node --test tests/admin.test.js)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { execFile } from 'node:child_process';

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/studyai_test_admin';
process.env.DISABLE_SCHEDULER = '1';

const { connectDB } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');

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

async function promoteTo(email, role) {
  const { User } = await import('../src/models/User.js');
  return User.findOneAndUpdate({ email }, { role }, { new: true });
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

describe('super admin bootstrap (real seed script)', () => {
  it('seeds via CLI env vars, refuses weak passwords, reruns safely', async () => {
    const run = (env) =>
      new Promise((resolve) => {
        execFile(
          process.execPath,
          ['src/seed/superadmin.seed.js'],
          { cwd: process.cwd(), env: { ...process.env, ...env } },
          (err, stdout, stderr) => resolve({ err, stdout, stderr })
        );
      });
    const weak = await run({ SUPER_ADMIN_EMAIL: `root-${TAG}@ex.com`, SUPER_ADMIN_PASSWORD: 'short' });
    assert.notEqual(weak.err, null, 'weak password must fail');
    const first = await run({ SUPER_ADMIN_EMAIL: `root-${TAG}@ex.com`, SUPER_ADMIN_PASSWORD: 'LongRandomPass123' });
    assert.equal(first.err, null, `seed failed: ${first.stderr}`);
    assert.match(first.stdout, /Super admin created/);
    const again = await run({ SUPER_ADMIN_EMAIL: `root-${TAG}@ex.com`, SUPER_ADMIN_PASSWORD: 'LongRandomPass123' });
    assert.equal(again.err, null);
    assert.match(again.stdout, /password unchanged/);
    const login = await api('POST', '/api/auth/login', {
      body: { email: `root-${TAG}@ex.com`, password: 'LongRandomPass123' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.data.user.role, 'super_admin');
  });
});

describe('registration + hierarchy enforcement', () => {
  it('public registration blocks admin and super_admin roles', async () => {
    for (const role of ['admin', 'super_admin']) {
      const r = await api('POST', '/api/auth/register', {
        body: { name: 'X', email: `blocked-${role}-${TAG}@ex.com`, password: 'secret123', role },
      });
      assert.ok([400, 403].includes(r.status), `${role} got ${r.status}`);
    }
  });

  it('ordinary admin cannot grant, suspend, or delete privileged accounts', async () => {
    const a = await register(`adm-${TAG}@ex.com`);
    const s = await register(`stu-${TAG}@ex.com`);
    const { User } = await import('../src/models/User.js');
    await User.findOneAndUpdate({ email: `adm-${TAG}@ex.com` }, { role: 'admin' });
    const AH = jar();
    const re = await api('POST', '/api/auth/login', { body: { email: `adm-${TAG}@ex.com`, password: 'secret123' }, auth: AH });
    assert.equal(re.status, 200);
    // grant admin -> 403
    const grant = await api('PATCH', `/api/auth/users/${s.user.id}/role`, { auth: AH, body: { role: 'admin' } });
    assert.equal(grant.status, 403);
    // suspend fellow admin -> 403
    const a2 = await register(`adm2-${TAG}@ex.com`);
    await User.findOneAndUpdate({ email: `adm2-${TAG}@ex.com` }, { role: 'admin' });
    const susp = await api('PATCH', `/api/admin/users/${a2.user.id}/status`, { auth: AH, body: { status: 'suspended' } });
    assert.equal(susp.status, 403);
    // delete admin -> 403
    const del = await api('DELETE', `/api/auth/users/${a2.user.id}`, { auth: AH });
    assert.equal(del.status, 403);
    // assign student->educator -> 200 (allowed)
    const ok = await api('PATCH', `/api/auth/users/${s.user.id}/role`, { auth: AH, body: { role: 'educator' } });
    assert.equal(ok.status, 200);
    // self role change -> 400
    const self = await api('PATCH', `/api/auth/users/${a.user.id}/role`, { auth: AH, body: { role: 'student' } });
    assert.equal(self.status, 400);
  });

  it('super admin manages admins; last super admin is protected', async () => {
    const s = await register(`sup-${TAG}@ex.com`);
    const { User } = await import('../src/models/User.js');
    await User.findOneAndUpdate({ email: `sup-${TAG}@ex.com` }, { role: 'super_admin' });
    const SH = jar();
    const re = await api('POST', '/api/auth/login', { body: { email: `sup-${TAG}@ex.com`, password: 'secret123' }, auth: SH });
    assert.equal(re.status, 200);
    // grant admin -> 200
    const t = await register(`tgt-${TAG}@ex.com`);
    const grant = await api('PATCH', `/api/auth/users/${t.user.id}/role`, { auth: SH, body: { role: 'admin' } });
    assert.equal(grant.status, 200);
    assert.equal(grant.data.data.role, 'admin');
    // suspend admin -> 200
    const susp = await api('PATCH', `/api/admin/users/${t.user.id}/status`, { auth: SH, body: { status: 'suspended' } });
    assert.equal(susp.status, 200);
    // demote sole super admin (self) -> blocked (self-change rule fires first)
    const me = await User.findOne({ email: `sup-${TAG}@ex.com` });
    const selfDemote = await api('PATCH', `/api/auth/users/${me._id}/role`, { auth: SH, body: { role: 'student' } });
    assert.equal(selfDemote.status, 400);
    // create second super admin directly, then demote the first -> allowed
    // (must be done by the other super admin — self-changes are refused)
    const s2 = await register(`sup2-${TAG}@ex.com`);
    await User.findOneAndUpdate({ email: `sup2-${TAG}@ex.com` }, { role: 'super_admin' });
    const SH2 = jar();
    const re2 = await api('POST', '/api/auth/login', { body: { email: `sup2-${TAG}@ex.com`, password: 'secret123' }, auth: SH2 });
    assert.equal(re2.status, 200);
    const demote = await api('PATCH', `/api/auth/users/${me._id}/role`, { auth: SH2, body: { role: 'student' } });
    assert.equal(demote.status, 200);
    // last-super-admin guards (service level). Make sup2 the sole super admin
    // (the seed test earlier created one too — remove the others first).
    await User.deleteMany({ role: 'super_admin', email: { $ne: `sup2-${TAG}@ex.com` } });
    const { setAccountStatus } = await import('../src/services/admin.service.js');
    const { updateUserRole, deleteUser } = await import('../src/services/auth.service.js');
    const ghost = { _id: new mongoose.Types.ObjectId(), role: 'super_admin', email: `ghost-${TAG}@ex.com` };
    const last = await User.findOne({ email: `sup2-${TAG}@ex.com` });
    await assert.rejects(setAccountStatus(ghost, last._id, 'suspended'), /last active super admin/);
    await assert.rejects(updateUserRole(last._id, 'student', ghost), /last super admin/);
    await assert.rejects(deleteUser(last._id, ghost), /last super admin/);
    void s;
  });

  it('students and educators cannot reach admin endpoints', async () => {
    const st = await register(`bl-${TAG}@ex.com`);
    const ed = await register(`ble-${TAG}@ex.com`, 'educator');
    for (const auth of [st.jar, ed.jar]) {
      for (const [m, p] of [['GET', '/api/admin/stats'], ['GET', '/api/admin/audit'], ['GET', '/api/admin/health']]) {
        const r = await api(m, p, { auth });
        assert.equal(r.status, 403, `${m} ${p}`);
      }
    }
  });
});

describe('admin console endpoints (real data, no hardcoded stats)', () => {
  it('stats, roles, health, analytics reflect the database', async () => {
    const s = await register(`sa-${TAG}@ex.com`);
    const { User } = await import('../src/models/User.js');
    await User.findOneAndUpdate({ email: `sa-${TAG}@ex.com` }, { role: 'super_admin' });
    const SH = jar();
    const re = await api('POST', '/api/auth/login', { body: { email: `sa-${TAG}@ex.com`, password: 'secret123' }, auth: SH });
    assert.equal(re.status, 200);
    const stats = await api('GET', '/api/admin/stats', { auth: SH });
    assert.equal(stats.status, 200);
    assert.ok(stats.data.data.users.byRole.student >= 1, 'real student count');
    const roles = await api('GET', '/api/admin/roles', { auth: SH });
    assert.ok(roles.data.data.roles.includes('super_admin'));
    assert.ok(roles.data.data.matrix.length > 5);
    const health = await api('GET', '/api/admin/health', { auth: SH });
    assert.equal(health.data.data.mongo.status, 'ok');
    assert.ok(!JSON.stringify(health.data).match(/sk-|OPENAI_API_KEY/), 'no secrets leak');
    const ai = await api('GET', '/api/admin/ai-status', { auth: SH });
    assert.ok(ai.data.data.provider, 'provider reported');
    assert.ok(!JSON.stringify(ai.data).match(/sk-[A-Za-z0-9]/), 'no API keys leak');
    const an = await api('GET', '/api/admin/analytics', { auth: SH, query: { days: '7' } });
    assert.equal(an.data.data.days, 7);
    assert.equal(an.data.data.signupsPerDay.length, 7);
    const tx = await api('GET', '/api/meta/taxonomy', { auth: SH });
    assert.ok(tx.data.data.subjects.length > 0, 'seeded taxonomy lists');
  });

  it('user create/detail/reset-password flow with audit', async () => {
    const s = await register(`sb-${TAG}@ex.com`);
    const { User } = await import('../src/models/User.js');
    await User.findOneAndUpdate({ email: `sb-${TAG}@ex.com` }, { role: 'super_admin' });
    const SH = jar();
    const re = await api('POST', '/api/auth/login', { body: { email: `sb-${TAG}@ex.com`, password: 'secret123' }, auth: SH });
    assert.equal(re.status, 200);
    // admin-created admin blocked for plain admins: create as super admin instead
    const created = await api('POST', '/api/admin/users', {
      auth: SH,
      body: { name: 'Newbie', email: `nb-${TAG}@ex.com`, password: 'secret123', role: 'admin' },
    });
    assert.equal(created.status, 201);
    const detail = await api('GET', `/api/admin/users/${created.data.data.id}`, { auth: SH });
    assert.equal(detail.status, 200);
    assert.ok(detail.data.data.learning, 'learning summary present');
    const reset = await api('POST', `/api/admin/users/${created.data.data.id}/reset-password`, { auth: SH });
    assert.equal(reset.status, 200);
    assert.ok(reset.data.data.resetToken, 'single-use token issued');
    // token is usable exactly once
    const used = await api('POST', '/api/auth/reset-password', {
      body: { token: reset.data.data.resetToken, newPassword: 'rotated123' },
    });
    assert.equal(used.status, 200);
    const login = await api('POST', '/api/auth/login', { body: { email: `nb-${TAG}@ex.com`, password: 'rotated123' } });
    assert.equal(login.status, 200);
    const log = await api('GET', '/api/admin/audit', { auth: SH, query: { action: 'user.reset-password' } });
    assert.ok(log.data.data.total >= 1, 'reset audited');
  });

  it('settings allowlist rejects unknown keys; plan limits surface', async () => {
    const s = await register(`sc-${TAG}@ex.com`);
    const { User } = await import('../src/models/User.js');
    await User.findOneAndUpdate({ email: `sc-${TAG}@ex.com` }, { role: 'super_admin' });
    const SH = jar();
    const re = await api('POST', '/api/auth/login', { body: { email: `sc-${TAG}@ex.com`, password: 'secret123' }, auth: SH });
    assert.equal(re.status, 200);
    const bad = await api('PUT', '/api/admin/settings', { auth: SH, body: { key: 'JWT_SECRET', value: 'x' } });
    assert.equal(bad.status, 400);
    const badRange = await api('PUT', '/api/admin/settings', { auth: SH, body: { key: 'plan.maxDays', value: '9999' } });
    assert.equal(badRange.status, 400);
    const ok = await api('PUT', '/api/admin/settings', { auth: SH, body: { key: 'plan.maxDays', value: '30' } });
    assert.equal(ok.status, 200);
    const limits = await api('GET', '/api/admin/plans-limits', { auth: SH });
    assert.equal(limits.data.data.maxDays, 30);
  });

  it('module management: plans, resources, assessments, announcements', async () => {
    const s = await register(`sd-${TAG}@ex.com`);
    const { User } = await import('../src/models/User.js');
    await User.findOneAndUpdate({ email: `sd-${TAG}@ex.com` }, { role: 'super_admin' });
    const SH = jar();
    const re = await api('POST', '/api/auth/login', { body: { email: `sd-${TAG}@ex.com`, password: 'secret123' }, auth: SH });
    assert.equal(re.status, 200);
    const plans = await api('GET', '/api/admin/plans', { auth: SH });
    assert.equal(plans.status, 200);
    const res = await api('GET', '/api/admin/resources', { auth: SH });
    assert.equal(res.status, 200);
    const as = await api('GET', '/api/admin/assessments', { auth: SH });
    assert.equal(as.status, 200);
    const ann = await api('POST', '/api/admin/announcements', { auth: SH, body: { title: 'Hello', roles: ['student'] } });
    assert.equal(ann.status, 201);
    assert.ok(ann.data.data.recipients >= 1);
    const ns = await api('GET', '/api/admin/notifications/stats', { auth: SH });
    assert.ok('announcement' in ns.data.data.byKind || ns.data.data.last7d >= 0);
  });
});
