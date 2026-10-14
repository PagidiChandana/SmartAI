import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as admin from '../services/admin.service.js';

export const stats = asyncHandler(async (req, res) => {
  new ApiResponse('Platform stats ready', await admin.platformStats(req.user)).send(res);
});
export const setStatus = asyncHandler(async (req, res) => {
  new ApiResponse(`Account ${req.body.status}`, await admin.setAccountStatus(req.user, req.params.id, req.body.status)).send(res);
});
export const taxonomy = asyncHandler(async (req, res) => {
  new ApiResponse('Taxonomy ready', await admin.getTaxonomy(req.user, { manage: true })).send(res);
});
export const taxonomyPublic = asyncHandler(async (req, res) => {
  new ApiResponse('Taxonomy ready', await admin.getTaxonomy(req.user, { manage: false })).send(res);
});
export const taxonomyAdd = asyncHandler(async (req, res) => {
  new ApiResponse('Entry added', await admin.addTaxonomy(req.user, req.body), 201).send(res);
});
export const taxonomyToggle = asyncHandler(async (req, res) => {
  new ApiResponse('Entry updated', await admin.setTaxonomyActive(req.user, req.params.id, req.body.active)).send(res);
});
export const taxonomyDelete = asyncHandler(async (req, res) => {
  new ApiResponse('Entry deleted', await admin.deleteTaxonomy(req.user, req.params.id)).send(res);
});
export const settings = asyncHandler(async (req, res) => {
  new ApiResponse('Settings ready', await admin.getSettings(req.user)).send(res);
});
export const settingSet = asyncHandler(async (req, res) => {
  new ApiResponse('Setting saved', await admin.setSetting(req.user, req.body.key, req.body.value)).send(res);
});
export const usage = asyncHandler(async (req, res) => {
  new ApiResponse('Usage stats ready', await admin.usageStats(req.user, req.query)).send(res);
});
export const auditLog = asyncHandler(async (req, res) => {
  new ApiResponse('Audit log ready', await admin.auditLog(req.user, req.query)).send(res);
});
export const reports = asyncHandler(async (req, res) => {
  new ApiResponse('Reports ready', await admin.listReports(req.user, req.query)).send(res);
});
export const reportHandle = asyncHandler(async (req, res) => {
  new ApiResponse('Report handled', await admin.handleReport(req.user, req.params.id, req.body)).send(res);
});
export const reportCreate = asyncHandler(async (req, res) => {
  new ApiResponse('Report submitted — admins will review it', await admin.createReport(req.user, req.body), 201).send(res);
});
export const createUser = asyncHandler(async (req, res) => {
  new ApiResponse('User created', await admin.createUser(req.user, req.body), 201).send(res);
});
export const userDetail = asyncHandler(async (req, res) => {
  new ApiResponse('User detail ready', await admin.getUserDetail(req.user, req.params.id)).send(res);
});
export const userResetPassword = asyncHandler(async (req, res) => {
  // Token shown ONCE — the admin passes it to the user out-of-band.
  // Single-use, expires per RESET_TOKEN_MINUTES. Never logged.
  new ApiResponse('Reset token issued (show once)', await admin.issuePasswordReset(req.user, req.params.id)).send(res);
});
export const roles = asyncHandler(async (req, res) => {
  new ApiResponse('Roles ready', await admin.roleMatrix(req.user)).send(res);
});
export const plans = asyncHandler(async (req, res) => {
  new ApiResponse('Plans fetched', await admin.listPlansAdmin(req.user, req.query)).send(res);
});
export const planDetail = asyncHandler(async (req, res) => {
  new ApiResponse('Plan detail ready', await admin.planDetailAdmin(req.user, req.params.id)).send(res);
});
export const planLimits = asyncHandler(async (req, res) => {
  const { getPlannerLimits } = await import('../services/planner.service.js');
  new ApiResponse('Planner limits ready', await getPlannerLimits()).send(res);
});
export const resources = asyncHandler(async (req, res) => {
  new ApiResponse('Resources fetched', await admin.listResourcesAdmin(req.user, req.query)).send(res);
});
export const resourceUpdate = asyncHandler(async (req, res) => {
  new ApiResponse('Resource updated', await admin.updateResourceAdmin(req.user, req.params.id, req.body)).send(res);
});
export const resourceDelete = asyncHandler(async (req, res) => {
  new ApiResponse('Resource deleted', await admin.deleteResourceAdmin(req.user, req.params.id)).send(res);
});
export const assessments = asyncHandler(async (req, res) => {
  new ApiResponse('Assessments fetched', await admin.listAssessmentsAdmin(req.user, req.query)).send(res);
});
export const assessmentAttempts = asyncHandler(async (req, res) => {
  new ApiResponse('Attempts fetched', await admin.assessmentAttemptsAdmin(req.user, req.params.id, req.query)).send(res);
});
export const aiStatus = asyncHandler(async (req, res) => {
  new ApiResponse('AI status ready', await admin.aiStatus(req.user)).send(res);
});
export const announce = asyncHandler(async (req, res) => {
  new ApiResponse('Announcement sent', await admin.broadcastAnnouncement(req.user, req.body), 201).send(res);
});
export const notifStats = asyncHandler(async (req, res) => {
  new ApiResponse('Notification stats ready', await admin.notificationStats(req.user)).send(res);
});
export const analytics = asyncHandler(async (req, res) => {
  new ApiResponse('Platform analytics ready', await admin.platformAnalytics(req.user, req.query)).send(res);
});
export const health = asyncHandler(async (req, res) => {
  new ApiResponse('System health ready', await admin.systemHealth(req.user)).send(res);
});
