// src/api/routes/workflow.routes.js - Fixed with proper route ordering
import { Router } from 'express';
import {
    // Workflow CRUD
    createWorkflow,
    getWorkflow,
    listWorkflows,
    updateWorkflow,
    deleteWorkflow,
    
    // Node Management
    getNodeTypes,
    addNode,
    updateNode,
    deleteNode,
    
    // Edge Management
    addEdge,
    deleteEdge,
    
    // Workflow Publishing & Execution
    publishWorkflow,
    manualTrigger,
    startWorkflow,
    webhookTrigger,
    
    // Execution Control
    pauseWorkflowRun,
    resumeWorkflowRun,
    stopWorkflowRun,
    
    // Run Information (Enhanced)
    listRuns,
    getWorkflowRun,
    getRunStatus,
    getRunLogs,
    getNodeResult,
    getRunTimeline,
    getRunSummary,
} from '../controllers/workflow.controller.js';
import { authenticate, checkUsageLimit, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================

// Webhook trigger - uses webhook secret for authentication
// IMPORTANT: This must be BEFORE authenticate middleware
router.post('/workflows/:id/webhook/:secret', webhookTrigger);

// ============================================
// PROTECTED ROUTES (Authentication Required)
// ============================================

// Apply authentication to all routes below
router.use(authenticate);

// === Node Types ===
router.get('/workflows/node-types', getNodeTypes);

// === Workflow CRUD Operations ===
router.post('/workflows', createWorkflow);
router.get('/workflows', listWorkflows);
router.get('/workflows/:id', getWorkflow);
router.put('/workflows/:id', updateWorkflow);
router.delete('/workflows/:id', deleteWorkflow);

// === Workflow Publishing ===
router.put('/workflows/:id/publish', publishWorkflow);

// === Workflow Execution (With Usage Limit Check) ===
router.post('/workflows/:id/trigger', checkUsageLimit, manualTrigger);
router.post('/workflows/:id/start', checkUsageLimit, startWorkflow);

// === Node Management ===
router.post('/workflows/:id/nodes', addNode);
router.put('/workflows/:id/nodes/:nodeId', updateNode);
router.delete('/workflows/:id/nodes/:nodeId', deleteNode);

// === Edge Management ===
router.post('/workflows/:id/edges', addEdge);
router.delete('/workflows/:id/edges', deleteEdge);

// === Workflow Runs Management ===
router.get('/workflows/:id/runs', listRuns);
router.get('/workflows/:id/runs/:runId', getWorkflowRun);

// === Execution Control ===
router.post('/workflows/:id/runs/:runId/pause', pauseWorkflowRun);
router.post('/workflows/:id/runs/:runId/resume', resumeWorkflowRun);
router.post('/workflows/:id/runs/:runId/stop', stopWorkflowRun);

// === Run Information & Results ===
// These routes MUST have authenticate middleware applied
router.get('/runs/:id/status', getRunStatus);
router.get('/runs/:id/logs', getRunLogs);
router.get('/runs/:id/summary', getRunSummary);
router.get('/runs/:id/timeline', getRunTimeline);
router.get('/runs/:id/nodes/:nodeId/result', getNodeResult);

export default router;