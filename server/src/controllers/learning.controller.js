import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as learning from '../services/learning.service.js';

export const getProfile = asyncHandler(async (req, res) => {
  new ApiResponse('Profile fetched', await learning.getProfile(req.user)).send(res);
});
export const upsertProfile = asyncHandler(async (req, res) => {
  new ApiResponse('Profile saved', await learning.upsertProfile(req.user, req.body)).send(res);
});

export const listGoals = asyncHandler(async (req, res) => {
  new ApiResponse('Goals fetched', await learning.listGoals(req.user)).send(res);
});
export const createGoal = asyncHandler(async (req, res) => {
  new ApiResponse('Goal created', await learning.createGoal(req.user, req.body), 201).send(res);
});
export const patchGoal = asyncHandler(async (req, res) => {
  new ApiResponse('Goal updated', await learning.patchGoal(req.user, req.params.id, req.body)).send(res);
});
export const deleteGoal = asyncHandler(async (req, res) => {
  new ApiResponse('Goal deleted', await learning.deleteGoal(req.user, req.params.id)).send(res);
});

export const listSubjects = asyncHandler(async (req, res) => {
  new ApiResponse('Subjects fetched', await learning.listSubjects(req.user)).send(res);
});
export const createSubject = asyncHandler(async (req, res) => {
  new ApiResponse('Subject created', await learning.createSubject(req.user, req.body), 201).send(res);
});
export const patchSubject = asyncHandler(async (req, res) => {
  new ApiResponse('Subject updated', await learning.patchSubject(req.user, req.params.id, req.body)).send(res);
});
export const deleteSubject = asyncHandler(async (req, res) => {
  new ApiResponse('Subject deleted', await learning.deleteSubject(req.user, req.params.id)).send(res);
});

export const listTopics = asyncHandler(async (req, res) => {
  new ApiResponse('Topics fetched', await learning.listTopics(req.user, req.query)).send(res);
});
export const createTopic = asyncHandler(async (req, res) => {
  new ApiResponse('Topic created', await learning.createTopic(req.user, req.body), 201).send(res);
});
export const createTopicsBulk = asyncHandler(async (req, res) => {
  const docs = await learning.createTopicsBulk(req.user, req.body.subject, req.body.titles);
  new ApiResponse(`Added ${docs.length} topics`, docs, 201).send(res);
});
export const patchTopic = asyncHandler(async (req, res) => {
  new ApiResponse('Topic updated', await learning.patchTopic(req.user, req.params.id, req.body)).send(res);
});
export const deleteTopic = asyncHandler(async (req, res) => {
  new ApiResponse('Topic deleted', await learning.deleteTopic(req.user, req.params.id)).send(res);
});

export const uploadSyllabus = asyncHandler(async (req, res) => {
  const result = await learning.uploadSyllabus(req.user, req.file, req.body.subject);
  new ApiResponse(
    result.attachedToSubject
      ? `Extracted ${result.totalExtracted} topics and attached ${result.upload.topicsCreated} to subject`
      : `Extracted ${result.totalExtracted} topics (select a subject to attach them)`,
    result,
    201
  ).send(res);
});
export const listUploads = asyncHandler(async (req, res) => {
  new ApiResponse('Uploads fetched', await learning.listUploads(req.user)).send(res);
});

export const startDiagnostic = asyncHandler(async (req, res) => {
  new ApiResponse('Diagnostic started', await learning.startDiagnostic(req.user, req.body), 201).send(res);
});
export const submitDiagnostic = asyncHandler(async (req, res) => {
  new ApiResponse('Diagnostic submitted', await learning.submitDiagnostic(req.user, req.params.id, req.body.answers)).send(res);
});
export const listDiagnostics = asyncHandler(async (req, res) => {
  new ApiResponse('Diagnostics fetched', await learning.listDiagnostics(req.user)).send(res);
});

export const getChecklist = asyncHandler(async (req, res) => {
  new ApiResponse('Checklist fetched', await learning.getChecklist(req.user)).send(res);
});
