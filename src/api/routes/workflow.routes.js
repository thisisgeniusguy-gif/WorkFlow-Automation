// src/api/routes/workflow.routes.js
const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflow.controller');
const authMiddleware = require('../middleware/authMiddleware');

// Workflow Management APIs (require authentication)
router.use(authMiddleware);

// POST: Create a new Draft workflow
router.post('/workflows', workflowController.createWorkflow); 

// PUT: Publish a workflow (Draft -> Published)
router.put('/workflows/:id/publish', workflowController.publishWorkflow);

// GET: Fetch run logs
router.get('/runs/:id/logs', workflowController.getRunLogs); 

// --- PUBLIC/UNAUTHENTICATED WEBHOOK TRIGGER ---
// POST: Webhook Trigger endpoint
// Note: This endpoint is intentionally placed *outside* the authMiddleware scope
// because the webhookSecret handles authentication for this specific request.
router.post('/workflows/:id/webhook/:secret', workflowController.webhookTrigger);


module.exports = router;