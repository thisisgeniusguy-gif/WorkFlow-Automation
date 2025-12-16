// src/api/controllers/workflow.controller.js
import Workflow from '../../models/Workflow.js';
import WorkflowRun from '../../models/WorkflowRun.js';
import { executionQueue } from '../../config/queue.config.js';
import crypto from 'crypto';

// Utility to start a workflow run by queuing the first job
async function startWorkflowRun(workflow) {
    const runRecord = await WorkflowRun.create({
        workflowId: workflow._id, // Use _id for MongoDB
        status: 'PENDING',
    });

    const firstNode = workflow.definition.nodes[0];
    if (!firstNode) {
        throw new Error("Workflow has no nodes defined.");
    }
    
    // Add the first node execution job to the BullMQ queue
    await executionQueue.add('execute-node', {
        runId: runRecord._id, // Use _id for MongoDB
        workflowDefinition: workflow.definition,
        currentNodeId: firstNode.id,
        context: { trigger: 'webhook', payload: { } } // Initial context
    }, {
        jobId: runRecord._id // Use runId for idempotency
    });

    await runRecord.updateOne({ status: 'RUNNING' }); // Use updateOne for MongoDB
    return runRecord;
}

// --- POST /workflows: Create a new workflow (Draft) ---
export const createWorkflow = async (req, res) => {
    try {
        const { name, definition, cronSchedule } = req.body;

        // Validate required fields
        if (!name || !definition) {
            return res.status(400).json({ error: 'Name and definition are required.' });
        }

        // Validate cronSchedule if provided
        if (cronSchedule && !isValidCron(cronSchedule)) {
            return res.status(400).json({ error: 'Invalid cron schedule format.' });
        }

        const webhookSecret = crypto.randomBytes(16).toString('hex'); 
        
        const workflow = await Workflow.create({
            userId: req.user.id, // From authMiddleware
            name,
            definition,
            webhookSecret,
            cronSchedule: cronSchedule, // Store as null if not provided
            status: 'Draft'
        });
        res.status(201).json(workflow);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Function to validate cron expression
const isValidCron = (cron) => {
    // Simple regex for basic cron validation (you may want to use a library for comprehensive validation)
    const cronRegex = /^(\*|([0-5]?\d)(,\s*[0-5]?\d)*|\*\/[1-9]\d*)(\s+)(\*|([01]?\d|2[0-3])([,\/-][01]?\d|2[0-3])*){1,2}(\s+)(\*|([1-9]|[12][0-9]|3[01])([,\/-][1-9]|[12][0-9]|3[01])*){1,2}(\s+)(\*|([1-9]|1[0-2])([,\/-][1-9]|1[0-2])*){1,2}(\s+)(\*|[0-6]([,\/-][0-6])*)$/;
    return cronRegex.test(cron);
};

// --- PUT /workflows/:id/publish: Change status to Published ---
export const publishWorkflow = async (req, res) => {
    try {
        const workflow = await Workflow.findById(req.params.id);

        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }
        
        if (workflow.status === 'Published') {
            return res.status(200).json(workflow); // Already published
        }

        // Freeze the definition and change status
        await Workflow.updateOne({ _id: workflow._id }, { status: 'Published' }); // Use updateOne for MongoDB
        
        res.json(workflow);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- POST /workflows/:id/webhook/:secret: Webhook Trigger ---
export const webhookTrigger = async (req, res) => {
    try {
        const { id: workflowId, secret } = req.params;
        
        const workflow = await Workflow.findOne({ 
            _id: workflowId, 
            webhookSecret: secret, 
            status: 'Published' // Only Published workflows can be triggered
        });

        if (!workflow) {
            return res.status(404).json({ error: 'Invalid workflow ID or secret.' });
        }
        
        const runRecord = await startWorkflowRun(workflow); // Start execution

        res.status(202).json({ 
            message: 'Workflow execution accepted.', 
            runId: runRecord._id,
            status: runRecord.status
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- GET /runs/:id/logs: Fetch detailed run logs ---
export const getRunLogs = async (req, res) => {
    try {
        const run = await WorkflowRun.findById(req.params.id);
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found.' });
        }
        
        // Note: You should enforce user ownership check here based on run.workflowId

        res.json({
            id: run._id,
            status: run.status,
            logs: run.nodeLogs // Detailed node logs tracking
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Ensure database connection is established before processing queue jobs
export const ensureDbConnection = async () => {
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState !== 1) {
        throw new Error('Database connection not established');
    }
};
