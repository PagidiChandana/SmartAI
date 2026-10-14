import mongoose from 'mongoose';

// Supported subjects + exam categories, managed by admins.
// Frontend dropdowns fall back to built-in constants when empty.
export const TAXONOMY_TYPES = ['subject', 'exam'];

const taxonomySchema = new mongoose.Schema(
  {
    type: { type: String, enum: TAXONOMY_TYPES, required: true, index: true },
    value: { type: String, required: true, trim: true, maxlength: 100 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

taxonomySchema.index({ type: 1, value: 1 }, { unique: true });

export const Taxonomy = mongoose.model('Taxonomy', taxonomySchema);

const DEFAULTS = {
  subject: ['Physics', 'Chemistry', 'Maths', 'Biology', 'English'],
  exam: ['college', 'gate', 'cat', 'upsc', 'competitive'],
};

// Seed defaults once (lazy). Returns the active lists.
export async function taxonomyLists() {
  const count = await Taxonomy.countDocuments();
  if (count === 0) {
    await Taxonomy.insertMany(
      Object.entries(DEFAULTS).flatMap(([type, values]) => values.map((value) => ({ type, value, active: true })))
    );
  }
  const docs = await Taxonomy.find({ active: true }).sort({ type: 1, value: 1 }).lean();
  return {
    subjects: docs.filter((d) => d.type === 'subject').map((d) => d.value),
    exams: docs.filter((d) => d.type === 'exam').map((d) => d.value),
  };
}
