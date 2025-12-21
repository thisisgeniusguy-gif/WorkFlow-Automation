// executor.worker.js - Fixed version with proper ExecutionLogger usage

import { Worker, Queue } from 'bullmq';
import mongoose from 'mongoose';
import { schedule } from 'node-cron';

import WorkflowRun from '../models/WorkflowRun.js';
import Workflow from '../models/Workflow.js';
import NodeFactory from '../nodes/NodeFactory.js';
import ExecutionLogger from '../utils/ExecutionLogger.js';
import dotenv from 'dotenv';

dotenv.config();

// --- Configuration ---
const REDIS_CONNECTION = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
};
const EXECUTION_QUEUE_NAME = 'workflow-execution';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/workflow_db';

const executionQueue = new Queue(EXECUTION_QUEUE_NAME, {
    connection: REDIS_CONNECTION
});

mongoose.connect(MONGO_URI)
    .then(() => console.log("[MONGODB] Connection successful."))
    .catch(err => {
        console.error('[MONGODB] Connection failed:', err);
        process.exit(1);
    });

const cronJobs = new Map();

// --- DAG STRUCTURE ---
class DAG {
    constructor(nodes, edges) {
        this.nodes = new Map(nodes.map(n => [n.id, n]));
        this.predecessorsList = new Map();
        this.adjacencyList = new Map();
        this.inDegree = new Map();
        
        nodes.forEach(n => {
            this.adjacencyList.set(n.id, []);
            this.predecessorsList.set(n.id, []);
            this.inDegree.set(n.id, 0);
        });

        edges.forEach(edge => {
            if (!this.adjacencyList.has(edge.from) || !this.inDegree.has(edge.to)) {
                console.error(`[DAG] Invalid edge: ${edge.from} -> ${edge.to}`);
                return;
            }
            
            this.adjacencyList.get(edge.from).push(edge.to);
            this.predecessorsList.get(edge.to).push(edge.from);
            this.inDegree.set(edge.to, this.inDegree.get(edge.to) + 1);
        });
    }

    getPredecessorNodes(nodeId) {
        return this.predecessorsList.get(nodeId) || [];
    }

    getNextNodes(nodeId) {
        return this.adjacencyList.get(nodeId) || [];
    }

    getInitialNodes() {
        return Array.from(this.inDegree.entries())
            .filter(([_, degree]) => degree === 0)
            .map(([nodeId, _]) => nodeId);
    }

    detectCycles() {
        const visited = new Set();
        const recStack = new Set();

        const hasCycle = (nodeId) => {
            visited.add(nodeId);
            recStack.add(nodeId);

            const neighbors = this.adjacencyList.get(nodeId) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    if (hasCycle(neighbor)) return true;
                } else if (recStack.has(neighbor)) {
                    return true;
                }
            }

            recStack.delete(nodeId);
            return false;
        };

        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                if (hasCycle(nodeId)) return true;
            }
        }
        return false;
    }
}

// --- UTILITIES ---
const serializeDAG = (dag) => {
    const edges = [];
    dag.adjacencyList.forEach((targets, fromNode) => {
        targets.forEach(toNode => {
            edges.push({ from: fromNode, to: toNode });
        });
    });
    
    return {
        nodes: Array.from(dag.nodes.values()),
        edges: edges,
    };
};

const deserializeDAG = (serialized) => {
    if (!serialized?.nodes || !Array.isArray(serialized.nodes)) {
        throw new Error('Invalid serialized DAG structure');
    }
    return new DAG(serialized.nodes, serialized.edges || []);
};

const safeSerialize = (data, maxDepth = 10) => {
    const seen = new WeakSet();
    
    const serialize = (obj, depth = 0) => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;
        if (depth > maxDepth) return '[Max Depth Reached]';
        
        if (seen.has(obj)) return '[Circular Reference]';
        seen.add(obj);
        
        if (Array.isArray(obj)) {
            return obj.map(item => serialize(item, depth + 1));
        }
        
        if (obj instanceof Date) {
            return obj.toISOString();
        }
        
        if (obj instanceof Error) {
            return {
                name: obj.name,
                message: obj.message,
                stack: obj.stack
            };
        }
        
        const serialized = {};
        for (const [key, value] of Object.entries(obj)) {
            try {
                serialized[key] = serialize(value, depth + 1);
            } catch (error) {
                serialized[key] = `[Serialization Error: ${error.message}]`;
            }
        }
        
        return serialized;
    };
    
    try {
        const serialized = serialize(data);
        JSON.stringify(serialized);
        return serialized;
    } catch (error) {
        console.error('[SERIALIZE] Failed to serialize data:', error.message);
        return {
            _serializationError: true,
            error: error.message,
            type: typeof data,
            preview: String(data).substring(0, 100)
        };
    }
};

const truncateForDisplay = (data, maxLength = 500) => {
    if (data === null || data === undefined) return data;
    
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    
    if (str.length > maxLength) {
        return {
            preview: str.substring(0, maxLength) + '...',
            truncated: true,
            originalLength: str.length
        };
    }
    
    return data;
};

// --- Helper: Prepare Node Input Data ---
const prepareNodeInput = (nodeId, predecessors, nodeResults, context) => {
    const inputData = {
        nodeId,
        predecessors: predecessors || [],
        predecessorResults: {}
    };

    // Collect results from all predecessor nodes
    if (predecessors && predecessors.length > 0) {
        predecessors.forEach(predId => {
            if (nodeResults[predId]) {
                inputData.predecessorResults[predId] = nodeResults[predId];
            }
        });
    }

    // If there's only one predecessor, also provide its result directly
    if (predecessors.length === 1) {
        const singlePredId = predecessors[0];
        if (nodeResults[singlePredId]) {
            inputData.previousResult = nodeResults[singlePredId];
        }
    }

    return inputData;
};

// --- Helper: Process Node Output ---
const processNodeOutput = (output, nodeType) => {
    // If output is null/undefined, return as is
    if (output === null || output === undefined) {
        return output;
    }

    // If output is already an array, return as is
    if (Array.isArray(output)) {
        return output;
    }

    // For certain node types, wrap single results in array
    const arrayNodeTypes = ['data_transformation', 'filter', 'loop'];
    if (arrayNodeTypes.includes(nodeType)) {
        return [output];
    }

    // For other nodes, return the output as is
    return output;
};

// --- SCHEDULER LOGIC ---
const executeWorkflow = async (workflowId, workflowDefinition) => {
    try {
        if (!workflowDefinition?.nodes?.length) {
            throw new Error('Workflow definition is invalid or has no nodes.');
        }
        
        const dag = new DAG(workflowDefinition.nodes, workflowDefinition.edges || []);
        
        if (dag.detectCycles()) {
            throw new Error('Workflow contains cycles and cannot be executed.');
        }

        const startNodes = dag.getInitialNodes();
        if (startNodes.length === 0) {
            throw new Error('Workflow has no starting nodes.');
        }
        
        const run = new WorkflowRun({
            workflowId,
            status: 'RUNNING',
            startTime: new Date(),
            nodeLogs: [],
            completedNodes: [],
            nodeResults: {},
            context: {
                trigger: 'cron',
                timestamp: new Date().toISOString(),
                triggerSource: 'scheduler',
                executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }
        });

        await run.save();

        // Queue all initial nodes
        await Promise.all(startNodes.map(nodeId =>
            executionQueue.add('execute-node', {
                runId: run._id.toString(),
                workflowDefinition: serializeDAG(dag),
                currentNodeId: nodeId,
                context: run.context,
            }, {
                removeOnComplete: true,
                removeOnFail: false,
            })
        ));

        console.log(`[SCHEDULER] Workflow ${run._id} started with ${startNodes.length} initial nodes`);
    } catch (error) {
        console.error(`[SCHEDULER] Failed to execute workflow ${workflowId}:`, error.message);
    }
};

const scheduleCronJob = (workflowId, cronExpression, workflowDefinition) => {
    const id = workflowId.toString();

    if (cronJobs.has(id)) {
        console.log(`[CRON] Stopping existing job for workflow ${id}`);
        cronJobs.get(id).stop();
    }

    try {
        const task = schedule(cronExpression, async () => {
            console.log(`[CRON] Executing workflow ${id} via schedule: ${cronExpression}`);
            await executeWorkflow(workflowId, workflowDefinition);
        }, {
            scheduled: true,
            timezone: process.env.TZ || 'UTC'
        });

        cronJobs.set(id, task);
        console.log(`[CRON] Job scheduled for workflow ${id}: ${cronExpression}`);
    } catch (error) {
        console.error(`[CRON] Failed to schedule workflow ${id}:`, error.message);
    }
};

const initializeCronSchedules = async () => {
    try {
        const workflows = await Workflow.find({
            status: 'Published',
            cronSchedule: { $exists: true, $ne: null }
        });

        for (const workflow of workflows) {
            if (workflow.cronSchedule && workflow.definition?.nodes?.length) {
                scheduleCronJob(workflow._id, workflow.cronSchedule, workflow.definition);
            }
        }

        console.log(`[SCHEDULER] Initialized ${workflows.length} cron schedules.`);
    } catch (error) {
        console.error('[SCHEDULER] Failed to initialize cron schedules:', error.message);
    }
};

// --- WORKER LOGIC ---
const checkAndQueueReadySuccessors = async (runId, dag, finishedNodeId) => {
    try {
        const runRecord = await WorkflowRun.findById(runId);
        if (!runRecord) {
            console.error(`[WORKER] Run record ${runId} not found`);
            return;
        }

        const nextNodeIds = dag.getNextNodes(finishedNodeId);

        if (!nextNodeIds || nextNodeIds.length === 0) {
            console.log(`[WORKER] Node ${finishedNodeId} has no successors`);
            
            // Check if workflow is complete
            if (runRecord.completedNodes.length === dag.nodes.size) {
                await WorkflowRun.findByIdAndUpdate(runId, {
                    status: 'COMPLETED',
                    endTime: new Date()
                });
                console.log(`[WORKER] Workflow ${runId} completed successfully`);
            }
            return;
        }

        const candidates = nextNodeIds.filter(nodeId => 
            !runRecord.completedNodes.includes(nodeId)
        );

        await Promise.all(candidates.map(async (nextNodeId) => {
            const predecessors = dag.getPredecessorNodes(nextNodeId);

            if (!Array.isArray(predecessors)) {
                console.error(`[WORKER] Invalid predecessor list for node ${nextNodeId}`);
                return; 
            }

            const isReady = predecessors.every(predId => 
                runRecord.completedNodes.includes(predId)
            );

            if (isReady) {
                console.log(`[WORKER] Node ${nextNodeId} is ready. Queueing...`);
                
                await executionQueue.add('execute-node', {
                    runId: runId.toString(),
                    workflowDefinition: serializeDAG(dag),
                    currentNodeId: nextNodeId,
                    context: runRecord.context || {},
                }, {
                    removeOnComplete: true,
                    removeOnFail: false,
                });
            } else {
                const waitingFor = predecessors.filter(p => 
                    !runRecord.completedNodes.includes(p)
                );
                console.log(`[WORKER] Node ${nextNodeId} waiting for: ${waitingFor.join(', ')}`);
            }
        }));

        // Final completion check
        const updatedRunRecord = await WorkflowRun.findById(runId);
        if (updatedRunRecord && updatedRunRecord.completedNodes.length === dag.nodes.size) {
            await WorkflowRun.findByIdAndUpdate(runId, {
                status: 'COMPLETED',
                endTime: new Date()
            });
            console.log(`[WORKER] Workflow ${runId} completed successfully`);
        }
    } catch (error) {
        console.error(`[WORKER] Error checking successors for run ${runId}:`, error.message);
    }
};

const executorWorker = new Worker(EXECUTION_QUEUE_NAME, async (job) => {
    const { runId, workflowDefinition, currentNodeId, context } = job.data;
    const startTime = Date.now();
    
    console.log(`[WORKER] Processing node ${currentNodeId} for run ${runId}`);

    try {
        // Validate job data
        if (!runId || !workflowDefinition || !currentNodeId) {
            throw new Error('Invalid job data: missing required fields');
        }

        const dag = deserializeDAG(workflowDefinition); 
        const currentNode = dag.nodes.get(currentNodeId);

        if (!currentNode) {
            throw new Error(`Node ${currentNodeId} not found in DAG`);
        }

        // --- 1. Load Run Record ---
        const runRecord = await WorkflowRun.findById(runId);
        if (!runRecord) {
            throw new Error(`Run record ${runId} not found`);
        }

        // Check run status
        if (runRecord.status === 'PAUSED') {
            console.log(`[WORKER] Run ${runId} is paused. Skipping node ${currentNodeId}`);
            return;
        }

        if (['FAILED', 'COMPLETED'].includes(runRecord.status)) {
            console.log(`[WORKER] Run ${runId} already ${runRecord.status}. Skipping`);
            return;
        }

        // Prevent duplicate execution
        if (runRecord.completedNodes.includes(currentNodeId)) {
            console.log(`[WORKER] Node ${currentNodeId} already completed. Skipping`);
            return;
        }

        // Check if node type is supported
        if (!NodeFactory.hasType(currentNode.type)) {
            throw new Error(
                `No handler for node type: ${currentNode.type}. ` +
                `Available: ${NodeFactory.getAvailableTypes().join(', ')}`
            );
        }

        console.log(`[WORKER] Executing ${currentNode.type} node: ${currentNode.label}`);

        // --- 2. Prepare Execution Context with Predecessor Results ---
        const predecessors = dag.getPredecessorNodes(currentNodeId);
        
        // Prepare input data with predecessor results
        const inputData = prepareNodeInput(
            currentNodeId,
            predecessors,
            runRecord.nodeResults || {},
            context
        );

        // Enhanced execution context with dependency results
        const executionContext = {
            ...context,
            ...inputData,
            // Backward compatibility
            results: runRecord.nodeResults || {},
            trigger: context.trigger,
            payload: context.payload || {},
            headers: context.headers || {},
            query: context.query || {}
        };

        console.log(`[WORKER] Node ${currentNodeId} has ${predecessors.length} predecessors`);
        if (predecessors.length > 0) {
            console.log(`[WORKER] Predecessor results available:`, predecessors.map(p => 
                `${p}: ${runRecord.nodeResults[p] ? 'available' : 'missing'}`
            ).join(', '));
        }

        // --- 3. Execute Node with Enhanced Context ---
        const result = await NodeFactory.executeNode(
            currentNode.type, 
            currentNode.label, 
            currentNode.config || {}, 
            executionContext
        );

        // --- 4. Process and Normalize Output ---
        let rawOutput, newContext;
        
        if (!result) {
            rawOutput = null;
            newContext = context;
        } else if (typeof result === 'object') {
            if ('output' in result) {
                rawOutput = result.output;
                newContext = result.context || result.newContext || context;
            } else if ('result' in result) {
                rawOutput = result.result;
                newContext = result.context || context;
            } else if ('data' in result) {
                rawOutput = result;
                newContext = { ...context, ...result };
            } else {
                rawOutput = result;
                newContext = context;
            }
        } else {
            rawOutput = result;
            newContext = context;
        }

        // Normalize output
        const normalizedOutput = processNodeOutput(rawOutput, currentNode.type);
        const serializedOutput = safeSerialize(normalizedOutput);

        const executionDuration = Date.now() - startTime;

        console.log(`[WORKER] Node ${currentNodeId} produced ${Array.isArray(normalizedOutput) ? normalizedOutput.length : 1} output items`);

        // --- 5. Create Execution Log (Simple structure) ---
        const executionLog = {
            nodeId: currentNodeId,
            nodeType: currentNode.type,
            nodeLabel: currentNode.label,
            status: 'success',
            timestamp: new Date(),
            duration: executionDuration,
            input: safeSerialize(currentNode.config),
            output: truncateForDisplay(serializedOutput, 300)
        };

        // --- 6. Update Database (Atomic) ---
        const updatedContext = { 
            ...(newContext || {}), 
            results: {
                ...(runRecord.nodeResults || {}),
                [currentNodeId]: serializedOutput
            },
            lastExecutedNode: currentNodeId,
            lastExecutedAt: new Date().toISOString()
        };

        const updateResult = await WorkflowRun.findOneAndUpdate(
            { 
                _id: runId,
                completedNodes: { $ne: currentNodeId }
            },
            {
                $addToSet: { completedNodes: currentNodeId },
                $set: { 
                    [`nodeResults.${currentNodeId}`]: serializedOutput,
                    context: updatedContext,
                },
                $push: { nodeLogs: executionLog }
            },
            { new: true }
        );

        if (!updateResult) {
            console.log(`[WORKER] Node ${currentNodeId} was already completed by another worker`);
            return;
        }

        console.log(
            `[WORKER] ✓ Node ${currentNodeId} completed in ${executionDuration}ms with ${Array.isArray(normalizedOutput) ? normalizedOutput.length : 1} items`
        );

        // --- 7. Queue Successors ---
        await checkAndQueueReadySuccessors(runId, dag, currentNodeId);

    } catch (error) {
        const executionDuration = Date.now() - startTime;
        
        console.error(`[WORKER] ✗ Execution failed for node ${currentNodeId}:`, error.message);
        console.error(`[WORKER] Stack trace:`, error.stack);
        
        // --- Create Failure Log (Simple structure) ---
        const dag = deserializeDAG(workflowDefinition);
        const node = dag.nodes.get(currentNodeId);
        
        const failureLog = {
            nodeId: currentNodeId,
            nodeType: node?.type || 'unknown',
            nodeLabel: node?.label || 'Unknown Node',
            status: 'failed',
            timestamp: new Date(),
            duration: executionDuration,
            input: node ? safeSerialize(node.config) : null,
            error: error.message
        };

        try {
            await WorkflowRun.findByIdAndUpdate(runId, {
                status: 'FAILED',
                endTime: new Date(),
                $push: { nodeLogs: failureLog }
            });
        } catch (updateError) {
            console.error(`[WORKER] Failed to update run status:`, updateError.message);
        }
        
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
    concurrency: 5,
    limiter: {
        max: 100,
        duration: 1000
    }
});

// --- Event Handlers ---
executorWorker.on('completed', (job) => {
    console.log(`[WORKER] ✓ Job ${job.id} completed successfully`);
});

executorWorker.on('failed', (job, err) => {
    console.error(`[WORKER] ✗ Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
});

executorWorker.on('error', (err) => {
    console.error(`[WORKER] Worker error:`, err.message);
});

executorWorker.on('active', (job) => {
    console.log(`[WORKER] ▶ Job ${job.id} started processing`);
});

// --- Workflow Change Stream ---
const watchWorkflowChanges = async () => {
    try {
        const changeStream = Workflow.watch([
            {
                $match: {
                    'operationType': { $in: ['insert', 'update'] },
                    'fullDocument.status': 'Published',
                    'fullDocument.cronSchedule': { $exists: true, $ne: null }
                }
            }
        ]);

        changeStream.on('change', (change) => {
            const workflow = change.fullDocument;
            if (workflow?.cronSchedule && workflow.definition?.nodes?.length) {
                console.log(`[WATCH] Updating cron schedule for workflow ${workflow._id}`);
                scheduleCronJob(workflow._id, workflow.cronSchedule, workflow.definition);
            }
        });

        console.log('[WATCH] Monitoring workflow changes for cron schedules');
    } catch (error) {
        console.error('[WATCH] Failed to set up change stream:', error.message);
    }
};

// --- Initialization ---
const initialize = async () => {
    try {
        await new Promise((resolve) => {
            if (mongoose.connection.readyState === 1) {
                resolve();
            } else {
                mongoose.connection.once('connected', resolve);
            }
        });

        console.log('[WORKER] Verifying NodeFactory initialization...');
        console.log(`[WORKER] Available node types: ${NodeFactory.getAvailableTypes().join(', ')}`);

        await initializeCronSchedules();
        await watchWorkflowChanges();

        console.log('[WORKER] ✓ Executor worker initialized successfully');
    } catch (error) {
        console.error('[WORKER] Initialization failed:', error.message);
        process.exit(1);
    }
};

initialize();

// --- Graceful Shutdown ---
const shutdown = async () => {
    console.log("[SHUTDOWN] Shutting down gracefully...");
    
    try {
        cronJobs.forEach((job, id) => {
            console.log(`[SHUTDOWN] Stopping cron job for workflow ${id}`);
            job.stop();
        });
        cronJobs.clear();

        await executorWorker.close();
        console.log("[SHUTDOWN] Worker closed");

        await executionQueue.close();
        console.log("[SHUTDOWN] Queue closed");

        await mongoose.connection.close();
        console.log("[SHUTDOWN] MongoDB connection closed");

        process.exit(0);
    } catch (error) {
        console.error("[SHUTDOWN] Error during shutdown:", error.message);
        process.exit(1);
    }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason, promise) => {
    console.error('[WORKER] Unhandled Rejection at:', promise, 'reason:', reason);
});

export default { executorWorker, executionQueue };