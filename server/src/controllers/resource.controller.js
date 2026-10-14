import path from 'node:path';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { resourceFilePath } from '../services/storage.service.js';
import { isAdminRole } from '../models/User.js';
import * as resources from '../services/resource.service.js';

export const createResource = asyncHandler(async (req, res) => {
  new ApiResponse(
    isAdminRole(req.user.role) ? 'Material published' : 'Material submitted for admin review',
    await resources.createResource(req.user, req.body, req.file || null),
    201
  ).send(res);
});

export const listMine = asyncHandler(async (req, res) => {
  new ApiResponse('My materials fetched', await resources.listMine(req.user)).send(res);
});

export const patchOwn = asyncHandler(async (req, res) => {
  new ApiResponse('Material updated', await resources.patchOwn(req.user, req.params.id, req.body)).send(res);
});

export const archiveOwn = asyncHandler(async (req, res) => {
  new ApiResponse('Material archived', await resources.setArchived(req.user, req.params.id, true)).send(res);
});

export const unarchiveOwn = asyncHandler(async (req, res) => {
  new ApiResponse('Material restored', await resources.setArchived(req.user, req.params.id, false)).send(res);
});

export const deleteOwn = asyncHandler(async (req, res) => {
  new ApiResponse('Material deleted', await resources.deleteOwn(req.user, req.params.id)).send(res);
});

export const reviewQueue = asyncHandler(async (req, res) => {
  new ApiResponse('Review queue fetched', await resources.reviewQueue()).send(res);
});

export const approveResource = asyncHandler(async (req, res) => {
  const out = await resources.review(req.user, req.params.id, { approve: true, note: req.body.note });
  const { audit } = await import('../models/AuditLog.js');
  await audit(req.user, 'resource.approve', { targetType: 'Resource', targetId: req.params.id });
  new ApiResponse('Material approved', out).send(res);
});

export const rejectResource = asyncHandler(async (req, res) => {
  const out = await resources.review(req.user, req.params.id, { approve: false, note: req.body.note });
  const { audit } = await import('../models/AuditLog.js');
  await audit(req.user, 'resource.reject', { targetType: 'Resource', targetId: req.params.id });
  new ApiResponse('Material rejected', out).send(res);
});

export const listLibrary = asyncHandler(async (req, res) => {
  new ApiResponse('Library fetched', await resources.listLibrary(req.user, req.query)).send(res);
});

export const getResource = asyncHandler(async (req, res) => {
  new ApiResponse('Resource fetched', await resources.getResource(req.user, req.params.id)).send(res);
});

export const downloadFile = asyncHandler(async (req, res) => {
  const resource = await resources.downloadFile(req.user, req.params.id);
  res.setHeader('Content-Type', resource.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resource.fileName || 'download')}"`);
  res.sendFile(resourceFilePath(resource.filePath));
});

export const toggleBookmark = asyncHandler(async (req, res) => {
  new ApiResponse('Bookmark toggled', await resources.toggleBookmark(req.user, req.params.id)).send(res);
});

export const listBookmarks = asyncHandler(async (req, res) => {
  new ApiResponse('Bookmarks fetched', await resources.listBookmarks(req.user)).send(res);
});

export const setCompleted = asyncHandler(async (req, res) => {
  new ApiResponse(
    req.body.completed ? 'Marked as complete' : 'Marked as incomplete',
    await resources.setCompleted(req.user, req.params.id, Boolean(req.body.completed))
  ).send(res);
});

export const recommendations = asyncHandler(async (req, res) => {
  new ApiResponse('Recommendations ready', await resources.recommendations(req.user, req.query)).send(res);
});
