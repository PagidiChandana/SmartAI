import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';

/**
 * Secure admin seeding — CLI only.
 * Usage:
 *   ADMIN_EMAIL=admin@studyai.local ADMIN_PASSWORD=StrongPass123 npm run seed:admin
 * Never exposed through any public API endpoint.
 */
async function main() {
  if (!env.adminEmail || !env.adminPassword) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to seed an admin.');
    process.exit(1);
  }
  if (env.adminPassword.length < 6) {
    console.error('ADMIN_PASSWORD must be at least 6 characters.');
    process.exit(1);
  }
  await connectDB(env.mongoUri);
  const email = env.adminEmail.toLowerCase();
  let user = await User.findOne({ email }).select('+password');
  if (user) {
    user.name = env.adminName || user.name;
    user.role = 'admin';
    user.password = env.adminPassword; // re-hashed by pre-save hook
    await user.save();
    console.log(`Admin updated: ${email}`);
  } else {
    user = await User.create({
      name: env.adminName || 'Admin',
      email,
      password: env.adminPassword,
      role: 'admin',
    });
    console.log(`Admin created: ${email}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
