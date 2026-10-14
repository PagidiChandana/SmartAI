import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as educator from '../services/educator.service.js';

export const getProfile = asyncHandler(async (req, res) => {
  new ApiResponse('Educator profile ready', await educator.getProfile(req.user)).send(res);
});
export const updateProfile = asyncHandler(async (req, res) => {
  new ApiResponse('Profile updated', await educator.updateProfile(req.user, req.body)).send(res);
});
export const overview = asyncHandler(async (req, res) => {
  new ApiResponse('Educator overview ready', await educator.overview(req.user)).send(res);
});
export const listStudents = asyncHandler(async (req, res) => {
  new ApiResponse('Students fetched', await educator.listStudents(req.user)).send(res);
});
export const studentProgress = asyncHandler(async (req, res) => {
  new ApiResponse('Student progress ready', await educator.studentProgress(req.user, req.params.id)).send(res);
});
export const classSummary = asyncHandler(async (req, res) => {
  new ApiResponse('Class summary ready', await educator.classSummary(req.user)).send(res);
});
export const sendNote = asyncHandler(async (req, res) => {
  new ApiResponse('Feedback sent to student', await educator.sendNote(req.user, req.body), 201).send(res);
});
