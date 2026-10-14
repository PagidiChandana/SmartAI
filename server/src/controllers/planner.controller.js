import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as planner from '../services/planner.service.js';

export const generatePlan = asyncHandler(async (req, res) => {
  const result = await planner.generatePlan(req.user, req.body);
  new ApiResponse(
    result.source === 'ai' ? 'AI study plan generated' : 'Study plan generated (rule-based fallback)',
    result,
    201
  ).send(res);
});

export const regeneratePlan = asyncHandler(async (req, res) => {
  const result = await planner.regeneratePlan(req.user, req.params.id);
  new ApiResponse(`Plan regenerated as version ${result.plan.version} (history kept)`, result, 201).send(res);
});

export const listPlans = asyncHandler(async (req, res) => {
  new ApiResponse('Study plans fetched', await planner.listPlans(req.user)).send(res);
});

export const getPlan = asyncHandler(async (req, res) => {
  new ApiResponse('Study plan fetched', await planner.getPlan(req.user, req.params.id)).send(res);
});

export const planSummary = asyncHandler(async (req, res) => {
  new ApiResponse('Plan progress fetched', await planner.planSummary(req.user, req.params.id)).send(res);
});

export const patchPlan = asyncHandler(async (req, res) => {
  new ApiResponse('Study plan updated', await planner.patchPlan(req.user, req.params.id, req.body)).send(res);
});

export const listPlanTasks = asyncHandler(async (req, res) => {
  new ApiResponse('Tasks fetched', await planner.listPlanTasks(req.user, req.params.id, req.query)).send(res);
});

export const patchTask = asyncHandler(async (req, res) => {
  new ApiResponse('Task updated', await planner.patchTask(req.user, req.params.taskId, req.body)).send(res);
});

export const completeTask = asyncHandler(async (req, res) => {
  new ApiResponse('Task completed', await planner.setTaskStatus(req.user, req.params.taskId, 'completed')).send(res);
});

export const skipTask = asyncHandler(async (req, res) => {
  new ApiResponse('Task skipped', await planner.setTaskStatus(req.user, req.params.taskId, 'skipped')).send(res);
});

export const rescheduleTask = asyncHandler(async (req, res) => {
  new ApiResponse('Task rescheduled', await planner.rescheduleTask(req.user, req.params.taskId, req.body)).send(res);
});

export const deleteTask = asyncHandler(async (req, res) => {
  new ApiResponse('Task deleted', await planner.deleteTask(req.user, req.params.taskId)).send(res);
});
