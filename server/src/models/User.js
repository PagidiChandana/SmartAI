import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['student', 'educator', 'admin', 'super_admin'];
export const PUBLIC_ROLES = ['student', 'educator'];
export const ACCOUNT_STATUS = ['active', 'suspended'];

// Role hierarchy: super_admin satisfies every 'admin' requirement.
// Use these helpers everywhere instead of raw string comparisons so the
// hierarchy stays consistent across middleware and services.
export function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role) {
  return role === 'super_admin';
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'student', index: true },
    status: { type: String, enum: ACCOUNT_STATUS, default: 'active', index: true },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    // Educator profile fields (ignored for other roles).
    bio: { type: String, trim: true, maxlength: 1000, default: '' },
    teachingSubjects: { type: [String], default: [] },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak hashes/secrets — single place shaping public output.
userSchema.methods.toSafeJSON = function () {
  const base = {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (this.role === 'educator') {
    base.bio = this.bio || '';
    base.teachingSubjects = this.teachingSubjects || [];
  }
  return base;
};

export const User = mongoose.model('User', userSchema);
