const { Worker } = require('bullmq');
const WorkflowRun = require('../models/WorkflowRun'); 
// Placeholder for Redis connection config
// src/config/database.js (Ensure the connection object is correct)

const connection = {
    // These defaults are correct if Redis is running locally on the default port
    host: '127.0.0.1', 
    port: 6379, 
};

const NodeHandlers = {
    'http-request': require('../nodes/HttpHandler'),
    'condition': require('../nodes/ConditionHandler'),
    // Add other nodes (Delay, Notify) here
};

const executorWorker = new Worker('workflow-execution', async (job) => {
    const { runId, workflowDefinition, currentNodeId, context } = job.data;
    
    // --- 1. Fetch and Check Run Status ---
    const runRecord = await WorkflowRun.findByPk(runId);
    if (!runRecord) throw new Error(`Run ${runId} not found.`);
    if (runRecord.status === 'PAUSED') return; 

    const currentNode = workflowDefinition.nodes.find(n => n.id === currentNodeId);
    if (!currentNode) {
        await runRecord.update({ status: 'COMPLETED', endTime: new Date() });
        console.log(`Workflow ${runId} completed.`);
        return;
    }

    try {
        // --- 2. Execute the Node ---
        const { output, duration } = await NodeHandlers[currentNode.type].execute(currentNode.config, context);

        // --- 3. Persist Log (Logs Tracking) ---
        const newLog = { 
            nodeId: currentNodeId, 
            type: currentNode.type, 
            input: context, 
            output: output, 
            duration: duration, 
            timestamp: new Date() 
        };
        await runRecord.update({ 
            nodeLogs: [...runRecord.nodeLogs, newLog]
        });

        // --- 4. Determine Next Step & Enqueue ---
        let nextNodeId = currentNode.next; 
        if (currentNode.type === 'condition') {
            nextNodeId = output.next; 
        }

        if (nextNodeId) {
            await job.queue.add('execute-node', {
                runId,
                workflowDefinition,
                currentNodeId: nextNodeId,
                context: { ...context, [currentNodeId]: output } // Update context
            }, {
                // Delay node implementation uses the queue's built-in delay
                delay: currentNode.type === 'delay' ? currentNode.config.seconds * 1000 : 0 
            });
        } else {
            await runRecord.update({ status: 'COMPLETED', endTime: new Date() });
        }
    } catch (error) {
        // --- 5. Failure Handling & Recovery ---
        console.error(`Execution failed for run ${runId}, node ${currentNodeId}: ${error.message}`);
        await runRecord.update({ 
            status: 'FAILED', 
            endTime: new Date(), 
            nodeLogs: [...runRecord.nodeLogs, { error: error.message, timestamp: new Date() }] 
        });
        // Error notification logic here
    }
}, { connection, 
    defaultJobOptions: {
        attempts: 3, 
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
    }
});

executorWorker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed after all retries.`, err);
});

module.exports = executorWorker;