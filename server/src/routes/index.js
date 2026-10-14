import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import learningRoutes from './learning.routes.js';
import plannerRoutes from './planner.routes.js';
import resourceRoutes from './resource.routes.js';
import tutorRoutes from './tutor.routes.js';
import assessmentRoutes from './assessment.routes.js';
import analyticsRoutes from './analytics.routes.js';
import educatorRoutes from './educator.routes.js';
import adminRoutes from './admin.routes.js';
import notificationRoutes from './notification.routes.js';
import metaRoutes from './meta.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/learning', learningRoutes);
router.use('/plans', plannerRoutes);
router.use('/resources', resourceRoutes);
router.use('/tutor', tutorRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/educator', educatorRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/meta', metaRoutes);

// Future modules plug in here:
// router.use('/planner', plannerRoutes);
// router.use('/ai', aiRoutes);
// router.use('/notifications', notificationRoutes);

export default router;
