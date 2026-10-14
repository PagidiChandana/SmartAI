import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as svc from '../services/assessment.service.js';

// Educator
export const createAssessment = asyncHandler(async (req, res) => {
  new ApiResponse('Assessment created as draft', await svc.createAssessment(req.user, req.body), 201).send(res);
});
export const listOwned = asyncHandler(async (req, res) => {
  new ApiResponse('My assessments fetched', await svc.listOwned(req.user)).send(res);
});
export const patchAssessment = asyncHandler(async (req, res) => {
  new ApiResponse('Assessment updated', await svc.patchAssessment(req.user, req.params.id, req.body)).send(res);
});
export const setStatus = asyncHandler(async (req, res) => {
  new ApiResponse(`Assessment ${req.body.status}`, await svc.setStatus(req.user, req.params.id, req.body.status)).send(res);
});
export const setAssignees = asyncHandler(async (req, res) => {
  new ApiResponse('Students assigned', await svc.setAssignees(req.user, req.params.id, req.body.emails)).send(res);
});
export const addAssignee = asyncHandler(async (req, res) => {
  const out = await svc.addAssignee(req.user, req.params.id, req.body.email);
  new ApiResponse(out.already ? 'Student already linked' : 'Student linked', out).send(res);
});
export const releaseResults = asyncHandler(async (req, res) => {
  new ApiResponse(req.body.released ? 'Results released' : 'Results hidden', await svc.releaseResults(req.user, req.params.id, req.body.released)).send(res);
});
export const addQuestion = asyncHandler(async (req, res) => {
  new ApiResponse('Question added', await svc.addQuestion(req.user, req.params.id, req.body), 201).send(res);
});
export const patchQuestion = asyncHandler(async (req, res) => {
  new ApiResponse('Question updated', await svc.patchQuestion(req.user, req.params.id, req.params.questionId, req.body)).send(res);
});
export const deleteQuestion = asyncHandler(async (req, res) => {
  new ApiResponse('Question deleted', await svc.deleteQuestion(req.user, req.params.id, req.params.questionId)).send(res);
});
export const reviewQuestion = asyncHandler(async (req, res) => {
  new ApiResponse('AI draft reviewed', await svc.reviewQuestion(req.user, req.params.id, req.params.questionId, req.body)).send(res);
});
export const draftQuestions = asyncHandler(async (req, res) => {
  const docs = await svc.draftQuestions(req.user, req.params.id, req.body);
  new ApiResponse(`Drafted ${docs.length} AI questions — review required before publishing`, docs, 201).send(res);
});
export const gradingQueue = asyncHandler(async (req, res) => {
  new ApiResponse('Grading queue fetched', await svc.needsGradingQueue(req.user, req.params.id)).send(res);
});
export const ownerQuestions = asyncHandler(async (req, res) => {
  new ApiResponse('Questions fetched', await svc.listOwnerQuestions(req.user, req.params.id)).send(res);
});
export const gradeShort = asyncHandler(async (req, res) => {
  new ApiResponse('Answer graded', await svc.gradeShortAnswer(req.user, req.params.attemptId, req.params.questionId, req.body)).send(res);
});
export const analytics = asyncHandler(async (req, res) => {
  new ApiResponse('Analytics fetched', await svc.assessmentAnalytics(req.user, req.params.id)).send(res);
});

// Student
export const listAvailable = asyncHandler(async (req, res) => {
  new ApiResponse('Available assessments fetched', await svc.listAvailable(req.user)).send(res);
});
export const startAttempt = asyncHandler(async (req, res) => {
  new ApiResponse('Attempt started — server timer running', await svc.startAttempt(req.user, req.params.id), 201).send(res);
});
export const autosave = asyncHandler(async (req, res) => {
  new ApiResponse('Progress autosaved', await svc.autosave(req.user, req.params.attemptId, req.body.answers)).send(res);
});
export const submitAttempt = asyncHandler(async (req, res) => {
  new ApiResponse('Attempt submitted and graded', await svc.submitAttempt(req.user, req.params.attemptId, req.body.answers)).send(res);
});
export const attemptResult = asyncHandler(async (req, res) => {
  new ApiResponse('Result fetched', await svc.getAttemptResult(req.user, req.params.attemptId)).send(res);
});
export const attemptHistory = asyncHandler(async (req, res) => {
  new ApiResponse('Attempt history fetched', await svc.attemptHistory(req.user, req.params.id)).send(res);
});
export const myPerformance = asyncHandler(async (req, res) => {
  new ApiResponse('Performance fetched', await svc.studentPerformance(req.user)).send(res);
});
