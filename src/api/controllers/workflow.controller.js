// src/api/controllers/workflow.controller.js
const Workflow = require('../../models/Workflow');
const WorkflowRun = require('../../models/WorkflowRun');
const { executionQueue } = require('../../config/queue.config');
const crypto = require('crypto');

// Utility to start a workflow run by queuing the first job
async function startWorkflowRun(workflow) {
    const runRecord = await WorkflowRun.create({
        workflowId: workflow.id,
        status: 'PENDING',
    });

    const firstNode = workflow.definition.nodes[0];
    if (!firstNode) {
        throw new Error("Workflow has no nodes defined.");
    }
    
    // Add the first node execution job to the BullMQ queue
    await executionQueue.add('execute-node', {
        runId: runRecord.id,
        workflowDefinition: workflow.definition,
        currentNodeId: firstNode.id,
        context: { trigger: 'webhook', payload: { } } // Initial context
    }, {
        jobId: runRecord.id // Use runId for idempotency
    });

    await runRecord.update({ status: 'RUNNING' });
    return runRecord;
}


// --- POST /workflows: Create a new workflow (Draft) ---
exports.createWorkflow = async (req, res) => {
    try {
        const { name, definition } = req.body;
        // Generate a simple secret key for the webhook trigger
        const webhookSecret = crypto.randomBytes(16).toString('hex'); 
        
        const workflow = await Workflow.create({
            userId: req.user.id, // From authMiddleware
            name,
            definition,
            webhookSecret,
            status: 'Draft'
        });
        res.status(201).json(workflow);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// --- PUT /workflows/:id/publish: Change status to Published ---
exports.publishWorkflow = async (req, res) => {
    try {
        const workflow = await Workflow.findOne({ 
            where: { id: req.params.id, userId: req.user.id } 
        });

        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }
        
        if (workflow.status === 'Published') {
            return res.status(200).json(workflow); // Already published
        }

        // Freeze the definition and change status
        await workflow.update({ status: 'Published' });
        
        // Logic to activate cron schedule would go here (Phase 2)

        res.json(workflow);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- POST /workflows/:id/webhook/:secret: Webhook Trigger ---
exports.webhookTrigger = async (req, res) => {
    try {
        const { id: workflowId, secret } = req.params;
        
        const workflow = await Workflow.findOne({ 
            where: { 
                id: workflowId, 
                webhookSecret: secret, 
                status: 'Published' // Only Published workflows can be triggered
            } 
        });

        if (!workflow) {
            return res.status(404).json({ error: 'Invalid workflow ID or secret.' });
        }
        
        const runRecord = await startWorkflowRun(workflow); // Start execution

        res.status(202).json({ 
            message: 'Workflow execution accepted.', 
            runId: runRecord.id,
            status: runRecord.status
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- GET /runs/:id/logs: Fetch detailed run logs ---
exports.getRunLogs = async (req, res) => {
    try {
        const run = await WorkflowRun.findByPk(req.params.id);
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found.' });
        }
        
        // Note: You should enforce user ownership check here based on run.workflowId

        res.json({
            id: run.id,
            status: run.status,
            logs: run.nodeLogs // Detailed node logs tracking
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};