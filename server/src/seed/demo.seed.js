import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Goal } from '../models/Goal.js';
import { Resource } from '../models/Resource.js';
import { Assessment } from '../models/Assessment.js';
import { Question } from '../models/Question.js';
import { Notification } from '../models/Notification.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { PlanTask } from '../models/PlanTask.js';
import { Attempt } from '../models/Attempt.js';
import { Reminder } from '../models/Reminder.js';

/**
 * Demo seed — development data for clicking through the app.
 * Usage: npm run seed:demo
 *
 * - Idempotent: safe to re-run (looks everything up by email/title first).
 * - Refuses to run in production unless ALLOW_DEMO_SEED=true.
 * - Demo logins: demo.student@studyai.local / Demo1234 (!),
 *   demo.educator@studyai.local / Demo1234 (!). Change or delete before
 *   any real deployment.
 */
const STUDENT_EMAIL = 'demo.student@studyai.local';
const EDUCATOR_EMAIL = 'demo.educator@studyai.local';
const DEMO_PASSWORD = 'Demo1234!';

async function upsertUser(email, name, role, extra = {}) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ name, email, password: DEMO_PASSWORD, role, ...extra });
    console.log(`Demo user created: ${email} (${role})`);
  } else if (user.role !== role) {
    user.role = role;
    await user.save();
    console.log(`Demo user role fixed: ${email} (${role})`);
  } else {
    console.log(`Demo user exists: ${email} (${role})`);
  }
  return user;
}

async function main() {
  if (env.isProd && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to override.');
    process.exit(1);
  }
  await connectDB(env.mongoUri);

  const student = await upsertUser(STUDENT_EMAIL, 'Demo Student', 'student');
  const educator = await upsertUser(EDUCATOR_EMAIL, 'Demo Educator', 'educator', {
    bio: 'Demo physics educator for walkthroughs.',
    teachingSubjects: ['Physics', 'Maths'],
  });

  await StudentProfile.findOneAndUpdate(
    { user: student._id },
    {
      $setOnInsert: {
        user: student._id,
        academicLevel: 'undergraduate',
        subjects: ['Physics', 'Maths'],
        learningStyle: 'visual',
        examType: 'gate',
        dailyStudyHours: 3,
      },
    },
    { upsert: true }
  );

  const subjects = {};
  for (const name of ['Physics', 'Maths']) {
    let s = await Subject.findOne({ user: student._id, name });
    if (!s) {
      s = await Subject.create({ user: student._id, name, description: `Demo ${name} syllabus` });
      console.log(`Demo subject created: ${name}`);
    }
    subjects[name] = s;
  }

  const topicSeed = [
    ['Physics', 'Kinematics', 'Unit 1: Mechanics', 'in-progress', 'medium', 3],
    ['Physics', 'Thermodynamics', 'Unit 2: Heat', 'not-started', 'hard', 2],
    ['Physics', 'Optics', 'Unit 3: Light', 'not-started', 'medium', 3],
    ['Maths', 'Algebra', 'Unit 1: Equations', 'completed', 'easy', 4],
    ['Maths', 'Calculus', 'Unit 2: Limits', 'in-progress', 'hard', 2],
  ];
  for (const [subj, title, section, status, difficulty, confidence] of topicSeed) {
    const exists = await Topic.findOne({ user: student._id, subject: subjects[subj]._id, title });
    if (!exists) {
      await Topic.create({ user: student._id, subject: subjects[subj]._id, title, section, status, difficulty, confidence, source: 'manual' });
      console.log(`Demo topic created: ${title}`);
    }
  }

  const goalTitle = 'Crack GATE Physics (demo)';
  if (!(await Goal.findOne({ user: student._id, title: goalTitle }))) {
    await Goal.create({
      user: student._id,
      title: goalTitle,
      subject: 'Physics',
      targetDate: new Date(Date.now() + 120 * 86400000),
      dailyStudyHours: 3,
    });
    console.log('Demo goal created');
  }

  const resourceTitle = 'Thermodynamics one-shot notes (demo)';
  let resource = await Resource.findOne({ owner: educator._id, title: resourceTitle });
  if (!resource) {
    resource = await Resource.create({
      owner: educator._id,
      title: resourceTitle,
      description: 'Demo-approved revision notes covering laws of thermodynamics with examples.',
      subject: 'Physics',
      topic: 'Thermodynamics',
      difficulty: 'intermediate',
      examType: 'gate',
      format: 'note',
      extractedText: 'Thermodynamics: zeroth, first (energy conservation, dU = dQ - dW), second (entropy), third law. Worked example: isothermal expansion...',
      status: 'approved',
    });
    console.log('Demo resource created (approved)');
  }

  const assessTitle = 'Physics Quick Check (demo)';
  if (!(await Assessment.findOne({ owner: educator._id, title: assessTitle }))) {
    const assessment = await Assessment.create({
      owner: educator._id,
      title: assessTitle,
      description: 'A short demo quiz. Answers release immediately.',
      kind: 'test',
      subject: 'Physics',
      topic: 'Thermodynamics',
      difficulty: 'beginner',
      durationMin: 15,
      deadline: new Date(Date.now() + 30 * 86400000),
      totalMarks: 4,
      status: 'published',
      visibility: 'all',
      maxAttempts: 3,
      releaseMode: 'immediate',
      showExplanations: true,
    });
    await Question.create([
      {
        assessment: assessment._id, type: 'mcq', topic: 'Thermodynamics',
        text: 'Which law states that energy cannot be created or destroyed?',
        options: ['Zeroth law', 'First law', 'Second law', 'Third law'],
        correctOption: 1, explanation: 'The first law is energy conservation: dU = dQ − dW.', marks: 2, order: 0,
      },
      {
        assessment: assessment._id, type: 'truefalse', topic: 'Thermodynamics',
        text: 'Entropy of an isolated system can decrease on its own.',
        correctBool: false, explanation: 'Second law: entropy never decreases spontaneously.', marks: 1, order: 1,
      },
      {
        assessment: assessment._id, type: 'short', topic: 'Thermodynamics',
        text: 'State the second law of thermodynamics in one sentence.',
        modelAnswer: 'The entropy of an isolated system never decreases.', marks: 1, order: 2,
      },
    ]);
    console.log('Demo assessment created (published, 3 questions)');
  }

  // Link demo student to the demo educator's assessment so the educator's
  // Students page is populated immediately (no attempt required).
  {
    const assessment = await Assessment.findOne({ owner: educator._id, title: assessTitle });
    const linked = (assessment.assignees || []).some((s) => s.toString() === student._id.toString());
    if (!linked) {
      assessment.assignees = [...(assessment.assignees || []), student._id];
      await assessment.save();
      console.log('Demo student linked to demo assessment');
    }
  }

  // Demo study plan with a mix of completed / pending / overdue tasks, so
  // the dashboard, analytics charts and plan board render real data.
  const dayAgo = (n) => {
    const d = new Date(Date.now() - n * 86400000);
    return d.toISOString().slice(0, 10);
  };
  let plan = await StudyPlan.findOne({ user: student._id, title: 'GATE prep — demo plan' });
  if (!plan) {
    plan = await StudyPlan.create({
      user: student._id,
      title: 'GATE prep — demo plan',
      examDate: new Date(Date.now() + 90 * 86400000),
      targetScore: 75,
      dailyHours: 3,
      weeklyHours: 18,
      subjects: [subjects.Physics._id, subjects.Maths._id],
      version: 1,
      status: 'active',
      source: 'rule-based',
      note: 'Demo plan — regenerate anytime to replace it.',
      totalTasks: 6,
      completedTasks: 3,
      skippedTasks: 0,
      totalMinutes: 270,
      remainingMinutes: 135,
    });
    const kinematics = await Topic.findOne({ user: student._id, title: 'Kinematics' });
    const thermo = await Topic.findOne({ user: student._id, title: 'Thermodynamics' });
    const algebra = await Topic.findOne({ user: student._id, title: 'Algebra' });
    await PlanTask.create([
      { user: student._id, plan: plan._id, subject: subjects.Physics._id, topic: kinematics?._id || null, title: 'Learn: Kinematics', objective: 'Explain motion graphs without notes', kind: 'learn', date: dayAgo(2), startMin: 540, durationMin: 45, status: 'completed' },
      { user: student._id, plan: plan._id, subject: subjects.Maths._id, topic: algebra?._id || null, title: 'Learn: Algebra', objective: 'Solve 10 linear equations', kind: 'learn', date: dayAgo(1), startMin: 540, durationMin: 60, status: 'completed' },
      { user: student._id, plan: plan._id, subject: subjects.Physics._id, topic: thermo?._id || null, title: 'Revise: Thermodynamics', objective: 'Recall the three laws from memory', kind: 'revision', date: dayAgo(1), startMin: 660, durationMin: 30, status: 'completed' },
      { user: student._id, plan: plan._id, subject: subjects.Physics._id, topic: thermo?._id || null, title: 'Learn: Thermodynamics', objective: 'Work entropy examples', kind: 'learn', date: dayAgo(1), startMin: 720, durationMin: 60, status: 'pending' },
      { user: student._id, plan: plan._id, subject: subjects.Maths._id, topic: null, title: 'Practice test — mixed subjects', objective: 'Timed set: 10 questions, review every miss', kind: 'practice-test', date: dayAgo(0), startMin: 540, durationMin: 45, status: 'pending' },
      { user: student._id, plan: plan._id, subject: subjects.Physics._id, topic: null, title: 'Break', objective: 'Step away — hydrate, stretch, rest eyes', kind: 'break', date: dayAgo(0), startMin: 585, durationMin: 30, status: 'pending' },
    ]);
    console.log('Demo plan created (3 completed, 2 pending, 1 overdue-ish)');
  }

  // Demo submitted attempt so score trend, topic mastery, educator class
  // summary and grading queue all have real rows (MCQ + TF correct).
  {
    const assessment = await Assessment.findOne({ owner: educator._id, title: assessTitle });
    const already = await Attempt.findOne({ user: student._id, assessment: assessment._id, status: { $ne: 'in-progress' } });
    if (!already) {
      const qs = await Question.find({ assessment: assessment._id }).sort({ order: 1 });
      const byType = Object.fromEntries(qs.map((q) => [q.type, q]));
      const now = new Date();
      await Attempt.create({
        user: student._id,
        assessment: assessment._id,
        attemptNo: 1,
        status: 'submitted',
        answers: [
          { question: byType.mcq._id, selectedOption: 1, isCorrect: true, marksAwarded: 2, needsGrading: false },
          { question: byType.truefalse._id, boolAnswer: false, isCorrect: true, marksAwarded: 1, needsGrading: false },
          { question: byType.short._id, textAnswer: 'Entropy never decreases.', isCorrect: null, marksAwarded: 0, needsGrading: true },
        ],
        score: 3,
        maxScore: 4,
        accuracy: 100,
        startedAt: new Date(now.getTime() - 20 * 60000),
        expiresAt: new Date(now.getTime() + 10 * 60000),
        submittedAt: now,
        timeSpentSec: 720,
      });
      console.log('Demo attempt submitted (MCQ + TF correct, short awaiting grading)');
    }
  }

    if (!(await Notification.findOne({ user: student._id, title: 'Welcome to StudyAI (demo)' }))) {    await Notification.create({
      user: student._id,
      from: educator._id,
      kind: 'announcement',
      title: 'Welcome to StudyAI (demo)',
      body: 'Explore the setup wizard, generate a plan, browse the library, and try the tutor. Delete demo data before real use.',
    });
    console.log('Demo notification created');
  }

  // Demo reminder (due tomorrow) so the Reminders page is non-empty and
  // the scheduler delivers it to the inbox on the next tick.
  if (!(await Reminder.findOne({ user: student._id, title: 'Revise Thermodynamics (demo)' }))) {
    await Reminder.create({
      user: student._id,
      title: 'Revise Thermodynamics (demo)',
      body: 'Re-read the one-shot notes and retry the Physics Quick Check.',
      type: 'task',
      refKind: 'none',
      scheduledAt: new Date(Date.now() + 24 * 86400000),
      status: 'scheduled',
    });
    console.log('Demo reminder created (due tomorrow)');
  }

  console.log('\nDemo logins (change or remove before any real deployment):');
  console.log(`  student:  ${STUDENT_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  educator: ${EDUCATOR_EMAIL} / ${DEMO_PASSWORD}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
