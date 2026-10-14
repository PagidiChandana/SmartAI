import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { isAdminRole } from '../models/User.js';
import * as analytics from '../services/analytics.service.js';
import * as adaptive from '../services/adaptive.service.js';

async function resolveUser(req) {
  // Admins may inspect a student's analytics for support (?userId=).
  // Students always see only their own data.
  if (req.query.userId && isAdminRole(req.user.role)) {
    const { User } = await import('../models/User.js');
    const u = await User.findById(req.query.userId);
    if (!u) {
      const { ApiError } = await import('../utils/ApiError.js');
      throw new ApiError(404, 'Student not found');
    }
    return u;
  }
  return req.user;
}

export const overview = asyncHandler(async (req, res) => {
  new ApiResponse('Analytics overview ready', await analytics.overview(await resolveUser(req))).send(res);
});

export const studyTime = asyncHandler(async (req, res) => {
  new ApiResponse('Study time ready', await analytics.studyTime(await resolveUser(req), req.query)).send(res);
});

export const taskStats = asyncHandler(async (req, res) => {
  new ApiResponse('Task stats ready', await analytics.taskStats(await resolveUser(req))).send(res);
});

export const syllabus = asyncHandler(async (req, res) => {
  new ApiResponse('Syllabus progress ready', await analytics.syllabusBySubject(await resolveUser(req))).send(res);
});

export const scores = asyncHandler(async (req, res) => {
  new ApiResponse('Score trend ready', await analytics.scoreTrend(await resolveUser(req), req.query)).send(res);
});

export const topics = asyncHandler(async (req, res) => {
  new ApiResponse('Topic mastery ready', await analytics.topicMastery(await resolveUser(req))).send(res);
});

export const recommend = asyncHandler(async (req, res) => {
  if (req.query.userId && !isAdminRole(req.user.role)) {
    const { ApiError } = await import('../utils/ApiError.js');
    throw new ApiError(403, 'You can only view your own recommendations');
  }
  new ApiResponse('Recommendations ready (rule-based)', await adaptive.recommend(await resolveUser(req))).send(res);
});

export const boost = asyncHandler(async (req, res) => {
  new ApiResponse('Revision sessions added to your plan', await adaptive.applyBoost(req.user, req.body), 201).send(res);
});

export const insights = asyncHandler(async (req, res) => {
  new ApiResponse('AI insights ready', await adaptive.aiInsights(req.user)).send(res);
});
