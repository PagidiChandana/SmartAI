import mongoose from 'mongoose';

// Simple string key/value platform settings (admin-managed).
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    value: { type: String, default: '', maxlength: 5000 },
  },
  { timestamps: true }
);

export const Setting = mongoose.model('Setting', settingSchema);
