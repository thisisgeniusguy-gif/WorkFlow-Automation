// src/api/routes/workflow.routes.js
import { Router } from 'express';
const router = Router();
import { createWorkflow, publishWorkflow, getRunLogs, webhookTrigger } from '../controllers/workflow.controller.js';
import authMiddleware from '../middleware/authMiddleware.js';

// Workflow Management APIs (require authentication)
router.use(authMiddleware);

// POST: Create a new Draft workflow
router.post('/workflows', createWorkflow); 

// PUT: Publish a workflow (Draft -> Published)
router.put('/workflows/:id/publish', publishWorkflow);

// GET: Fetch run logs
router.get('/runs/:id/logs', getRunLogs); 

// --- PUBLIC/UNAUTHENTICATED WEBHOOK TRIGGER ---
// POST: Webhook Trigger endpoint
// Note: This endpoint is intentionally placed *outside* the authMiddleware scope
// because the webhookSecret handles authentication for this specific request.
router.post('/workflows/:id/webhook/:secret', webhookTrigger);


export default router;