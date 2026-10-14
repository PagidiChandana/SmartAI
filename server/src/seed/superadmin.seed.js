import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';

/**
 * Secure SUPER ADMIN bootstrap — CLI only.
 * Usage:
 *   SUPER_ADMIN_EMAIL=root@studyai.local SUPER_ADMIN_PASSWORD=LongRandomPass123 npm run seed:superadmin
 * Never exposed through any public API endpoint. Credentials come only from
 * environment variables and are bcrypt-hashed before storage.
 * Safe to re-run: it will not demote or lock out existing super admins.
 */
async function main() {
  if (!env.superAdminEmail || !env.superAdminPassword) {
    console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars to seed a super admin.');
    process.exit(1);
  }
  if (env.superAdminPassword.length < 12) {
    console.error('SUPER_ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }
  await connectDB(env.mongoUri);
  const email = env.superAdminEmail.toLowerCase();
  let user = await User.findOne({ email }).select('+password');
  if (user) {
    user.name = env.superAdminName || user.name;
    user.role = 'super_admin';
    user.status = 'active';
    // Only reset the password when explicitly requested, so re-runs don't
    // lock anyone out unexpectedly.
    if (process.env.SUPER_ADMIN_RESET_PASSWORD === 'true') {
      user.password = env.superAdminPassword; // re-hashed by pre-save hook
    }
    await user.save();
    console.log(`Super admin ensured: ${email} (password ${process.env.SUPER_ADMIN_RESET_PASSWORD === 'true' ? 'reset' : 'unchanged'})`);
  } else {
    user = await User.create({
      name: env.superAdminName || 'Super Admin',
      email,
      password: env.superAdminPassword,
      role: 'super_admin',
    });
    console.log(`Super admin created: ${email}`);
  }
  const count = await User.countDocuments({ role: 'super_admin' });
  console.log(`Total super admins: ${count}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
