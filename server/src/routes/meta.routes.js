import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { taxonomyLists } from '../models/Taxonomy.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

// Active taxonomy for form dropdowns (subjects, exam categories).
router.get(
  '/taxonomy',
  asyncHandler(async (_req, res) => {
    new ApiResponse('Taxonomy ready', await taxonomyLists()).send(res);
  })
);

export default router;
