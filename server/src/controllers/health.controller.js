import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';

export const getHealth = asyncHandler(async (_req, res) => {
  new ApiResponse('Server is healthy', {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  }).send(res);
});
