// executor.worker.js (Consolidated Worker and Scheduler)

import { Worker, Queue } from 'bullmq';
import mongoose from 'mongoose';
import { schedule } from 'node-cron';

import WorkflowRun from '../models/WorkflowRun.js';
import Workflow from '../models/Workflow.js';
import HttpHandler from '../nodes/HttpHandler.js';
import ConditionHandler from '../nodes/ConditionHandler.js';

// --- Configuration ---
const REDIS_CONNECTION = {
    host: '127.0.0.1',
    port: 6379,
};
const EXECUTION_QUEUE_NAME = 'workflow-execution';
const MONGODB_URI = 'mongodb+srv://n8n_user:mongo1234@venue-main.ketzrpm.mongodb.net/?appName=venue-main';

// Instantiate the queue
const executionQueue = new Queue(EXECUTION_QUEUE_NAME, {
    connection: REDIS_CONNECTION
});

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log("MongoDB connection successful."))
    .catch(err => {
        console.error('MongoDB connection failed:', err);
        process.exit(1);
    });

const NodeHandlers = {
    'http-request': HttpHandler,
    'condition': ConditionHandler,
};

const cronJobs = new Map();

// --- SCHEDULER LOGIC ---

const executeWorkflow = async (workflowId, workflowDefinition) => {
    try {
        if (!workflowDefinition?.nodes?.length) {
            throw new Error('Workflow definition is invalid or has no nodes.');
        }

        const run = new WorkflowRun({
            workflowId,
            status: 'RUNNING',
            startTime: new Date(),
            nodeLogs: [],
        });

        await run.save();

        const startNodeId = workflowDefinition.start;
        const firstNode = workflowDefinition.nodes.find(n => n.id === startNodeId);

        if (!firstNode) throw new Error(`Workflow start node ${startNodeId} not found.`);

        await executionQueue.add('execute-node', {
            runId: run._id,
            workflowDefinition,
            currentNodeId: firstNode.id,
            context: {},
        });

        console.log(`[SCHEDULER] Initial job for run ${run._id} queued.`);
    } catch (error) {
        console.error(`[SCHEDULER] Failed to execute workflow ${workflowId}:`, error.message);
    }
};

const scheduleCronJob = (workflowId, cronExpression, workflowDefinition) => {
    const id = workflowId.toString();

    if (cronJobs.has(id)) {
        cronJobs.get(id).stop();
    }

    try {
        const task = schedule(cronExpression, async () => {
            console.log(`[CRON] Executing workflow ${id} via schedule.`);
            await executeWorkflow(workflowId, workflowDefinition);
        });

        cronJobs.set(id, task);
        console.log(`[CRON] Job scheduled for workflow ${id} with expression: ${cronExpression}`);
    } catch (error) {
        console.error(`[CRON] Failed to schedule cron for workflow ${id}:`, error.message);
    }
};

const initializeCronSchedules = async () => {
    try {
        const workflows = await Workflow.find({
            status: 'Published',
            cronSchedule: { $exists: true, $ne: null }
        });

        workflows.forEach(workflow => {
            if (workflow.cronSchedule) {
                scheduleCronJob(workflow._id, workflow.cronSchedule, workflow.definition);
            }
        });

        console.log(`[SCHEDULER] Initialized ${workflows.length} cron schedules.`);
    } catch (error) {
        console.error('[SCHEDULER] Failed to initialize cron schedules:', error.message);
    }
};

// --- WORKER LOGIC ---

const executorWorker = new Worker(EXECUTION_QUEUE_NAME, async (job) => {
    const { runId, workflowDefinition, currentNodeId, context } = job.data;

    const runRecord = await WorkflowRun.findById(runId);
    if (!runRecord) throw new Error(`Run ${runId} not found.`);
    if (runRecord.status === 'PAUSED') return;

    const currentNode = workflowDefinition.nodes.find(n => n.id === currentNodeId);
    if (!currentNode) throw new Error(`Node ${currentNodeId} not found.`);

    try {
        const { output, newContext } = await NodeHandlers[currentNode.type].execute(
            currentNode.config,
            context
        );

        const contextForNextNode = newContext || { ...context, [currentNodeId]: output };

        let nextNodeId = currentNode.next;
        if (currentNode.type === 'condition') {
            nextNodeId = output.next;
        }

        if (nextNodeId) {
            await executionQueue.add('execute-node', {
                runId,
                workflowDefinition,
                currentNodeId: nextNodeId,
                context: contextForNextNode
            }, {
                delay: currentNode.type === 'delay' ? currentNode.config.seconds * 1000 : 0
            });
        } else {
            runRecord.status = 'COMPLETED';
            runRecord.endTime = new Date();
            await runRecord.save();
        }
    } catch (error) {
        runRecord.status = 'FAILED';
        runRecord.endTime = new Date();
        await runRecord.save();
        throw error;
    }
}, {
    connection: REDIS_CONNECTION,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
    },
    concurrency: 1
});

executorWorker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job.id} failed:`, err.message);
});

executorWorker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} completed successfully.`);
});

// Initialize on startup
initializeCronSchedules();

// --- Graceful Shutdown ---
process.on('SIGTERM', async () => {
    console.log("Shutting down gracefully...");
    cronJobs.forEach(job => job.stop());
    await executorWorker.close();
    await executionQueue.close();
    await mongoose.connection.close();
    process.exit(0);
});

export default { executorWorker, executionQueue };
