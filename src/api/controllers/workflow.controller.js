// src/api/controllers/workflow.controller.js - Complete merged controller
import Workflow from '../../models/Workflow.js';
import WorkflowRun from '../../models/WorkflowRun.js';
import { executionQueue } from '../../config/queue.config.js';
import crypto from 'crypto';
import NodeFactory from '../../nodes/NodeFactory.js';
import ExecutionLogger from '../../utils/ExecutionLogger.js';

// --- DAG Helper Class ---
class DAG {
    constructor(nodes, edges) {
        this.nodes = new Map(nodes.map(n => [n.id, n]));
        this.adjacencyList = new Map();
        this.reverseAdjacencyList = new Map();
        this.inDegree = new Map();
        
        nodes.forEach(n => {
            this.adjacencyList.set(n.id, []);
            this.reverseAdjacencyList.set(n.id, []);
            this.inDegree.set(n.id, 0);
        });

        edges.forEach(edge => {
            this.adjacencyList.get(edge.from).push(edge.to);
            this.reverseAdjacencyList.get(edge.to).push(edge.from);
            this.inDegree.set(edge.to, this.inDegree.get(edge.to) + 1);
        });
    }

    getInitialNodes() {
        return Array.from(this.inDegree.entries())
            .filter(([_, degree]) => degree === 0)
            .map(([nodeId, _]) => nodeId);
    }

    getSuccessors(nodeId) {
        return this.adjacencyList.get(nodeId) || [];
    }

    getPredecessors(nodeId) {
        return this.reverseAdjacencyList.get(nodeId) || [];
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

// --- Serialization Helper ---
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

// --- Validation Helper ---
const isValidCron = (cron) => {
    const cronRegex = /^(\*|([0-5]?\d)(,\s*[0-5]?\d)*|\*\/[1-9]\d*)(\s+)(\*|([01]?\d|2[0-3])([,\/-][01]?\d|2[0-3])*){1,2}(\s+)(\*|([1-9]|[12][0-9]|3[01])([,\/-][1-9]|[12][0-9]|3[01])*){1,2}(\s+)(\*|([1-9]|1[0-2])([,\/-][1-9]|1[0-2])*){1,2}(\s+)(\*|[0-6]([,\/-][0-6])*)$/;
    return cronRegex.test(cron);
};

// ============================================
// WORKFLOW CRUD OPERATIONS
// ============================================

// --- POST /workflows: Create a new workflow ---
export const createWorkflow = async (req, res) => {
    try {
        const { name, description, cronSchedule } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Workflow name is required.' });
        }

        if (cronSchedule && !isValidCron(cronSchedule)) {
            return res.status(400).json({ error: 'Invalid cron schedule format.' });
        }

        // Check workflow limit if user has limits
        if (req.user.limits?.maxWorkflows) {
            const workflowCount = await Workflow.countDocuments({ userId: req.user._id || req.user.id });
            if (workflowCount >= req.user.limits.maxWorkflows) {
                return res.status(429).json({ 
                    error: 'Workflow limit reached',
                    limit: req.user.limits.maxWorkflows
                });
            }
        }

        const webhookSecret = crypto.randomBytes(16).toString('hex');
        
        const workflow = await Workflow.create({
            userId: req.user._id || req.user.id,
            name,
            description: description || '',
            definition: {
                nodes: [],
                edges: []
            },
            webhookSecret,
            cronSchedule: cronSchedule || null,
            status: 'Draft'
        });

        // Update user stats
        if (req.user.usage && req.user.usage.workflowsCreated !== undefined) {
            req.user.usage.workflowsCreated += 1;
            await req.user.save();
        }
        
        res.status(201).json({
            id: workflow._id,
            name: workflow.name,
            description: workflow.description,
            webhookSecret: workflow.webhookSecret,
            webhookUrl: `/workflows/${workflow._id}/webhook/${workflow.webhookSecret}`,
            status: workflow.status,
            nodeCount: 0,
            edgeCount: 0,
            createdAt: workflow.createdAt
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// --- GET /workflows: List all workflows ---
export const listWorkflows = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const workflows = await Workflow.find({ userId })
            .select('name description status createdAt updatedAt definition')
            .sort({ updatedAt: -1 });

        res.json({
            workflows: workflows.map(w => ({
                id: w._id,
                name: w.name,
                description: w.description,
                status: w.status,
                nodeCount: w.definition?.nodes?.length || 0,
                edgeCount: w.definition?.edges?.length || 0,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt
            })),
            total: workflows.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- GET /workflows/:id: Get single workflow ---
export const getWorkflow = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const workflow = await Workflow.findOne({ 
            _id: req.params.id,
            userId 
        });
        
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        res.json({
            id: workflow._id,
            name: workflow.name,
            description: workflow.description,
            status: workflow.status,
            webhookUrl: `/workflows/${workflow._id}/webhook/${workflow.webhookSecret}`,
            nodes: workflow.definition.nodes || [],
            edges: workflow.definition.edges || [],
            nodeCount: workflow.definition.nodes?.length || 0,
            edgeCount: workflow.definition.edges?.length || 0,
            cronSchedule: workflow.cronSchedule,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- PUT /workflows/:id: Update workflow ---
export const updateWorkflow = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const workflow = await Workflow.findOneAndUpdate(
            { _id: req.params.id, userId },
            req.body,
            { new: true, runValidators: true }
        );
        
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }
        
        res.json({
            id: workflow._id,
            name: workflow.name,
            description: workflow.description,
            status: workflow.status,
            updatedAt: workflow.updatedAt
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- DELETE /workflows/:id: Delete workflow ---
export const deleteWorkflow = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const workflow = await Workflow.findOneAndDelete({ 
            _id: req.params.id, 
            userId 
        });
        
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }
        
        res.json({ message: 'Workflow deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// NODE MANAGEMENT
// ============================================

// --- GET /workflows/node-types: Get available node types ---
export const getNodeTypes = async (req, res) => {
    try {
        const schemas = NodeFactory.getAllSchemas();
        
        res.json({
            nodeTypes: Object.keys(schemas),
            schemas: schemas
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- POST /workflows/:id/nodes: Add a node to workflow ---
export const addNode = async (req, res) => {
    try {
        const { type, label, config } = req.body;

        if (!type) {
            return res.status(400).json({ error: 'Node type is required.' });
        }

        if (!NodeFactory.hasType(type)) {
            return res.status(400).json({ 
                error: `Invalid node type: ${type}. Available types: ${NodeFactory.getAvailableTypes().join(', ')}` 
            });
        }

        const workflow = await Workflow.findById(req.params.id);
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        if (workflow.status === 'Published') {
            return res.status(400).json({ error: 'Cannot modify published workflow. Create a new version.' });
        }

        const validatedConfig = NodeFactory.validateConfig(type, config || {});
        const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const position = config?.position || { x: 0, y: 0 };
        delete validatedConfig.position;

        const newNode = {
            id: nodeId,
            type,
            label: label || `${type} Node`,
            config: validatedConfig,
            position: position
        };

        await workflow.addNode(newNode);
        
        console.log(`[ADD NODE] Node added successfully. Total nodes: ${workflow.definition.nodes.length}`);

        res.status(201).json({
            message: 'Node added successfully',
            node: newNode,
            workflowId: workflow._id,
            totalNodes: workflow.definition.nodes.length
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// --- PUT /workflows/:id/nodes/:nodeId: Update a node ---
export const updateNode = async (req, res) => {
    try {
        const { label, config } = req.body;
        const { id: workflowId, nodeId } = req.params;

        const workflow = await Workflow.findById(workflowId);
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        if (workflow.status === 'Published') {
            return res.status(400).json({ error: 'Cannot modify published workflow.' });
        }

        const nodeIndex = workflow.definition.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) {
            return res.status(404).json({ error: 'Node not found.' });
        }

        const node = workflow.definition.nodes[nodeIndex];

        if (label) {
            node.label = label;
        }

        if (config) {
            const validatedConfig = NodeFactory.validateConfig(node.type, config);
            const position = config.position || node.position;
            delete validatedConfig.position;
            
            node.config = validatedConfig;
            node.position = position;
        }

        workflow.definition.nodes[nodeIndex] = node;
        workflow.markModified('definition.nodes');
        await workflow.save();

        res.json({
            message: 'Node updated successfully',
            node
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// --- DELETE /workflows/:id/nodes/:nodeId: Remove a node ---
export const deleteNode = async (req, res) => {
    try {
        const { id: workflowId, nodeId } = req.params;

        const workflow = await Workflow.findById(workflowId);
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        if (workflow.status === 'Published') {
            return res.status(400).json({ error: 'Cannot modify published workflow.' });
        }

        await workflow.removeNode(nodeId);

        res.json({
            message: 'Node deleted successfully',
            deletedNodeId: nodeId,
            remainingNodes: workflow.definition.nodes.length,
            remainingEdges: workflow.definition.edges.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// EDGE MANAGEMENT
// ============================================

// --- POST /workflows/:id/edges: Connect nodes ---
export const addEdge = async (req, res) => {
    try {
        const { from, to, label, type } = req.body;

        if (!from || !to) {
            return res.status(400).json({ error: 'Both "from" and "to" node IDs are required.' });
        }

        const workflow = await Workflow.findById(req.params.id);
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        if (workflow.status === 'Published') {
            return res.status(400).json({ error: 'Cannot modify published workflow.' });
        }

        const fromNode = workflow.definition.nodes.find(n => n.id === from);
        const toNode = workflow.definition.nodes.find(n => n.id === to);

        if (!fromNode || !toNode) {
            return res.status(404).json({ error: 'One or both nodes not found.' });
        }

        const edgeExists = workflow.definition.edges.some(
            e => e.from === from && e.to === to
        );

        if (edgeExists) {
            return res.status(400).json({ error: 'Edge already exists between these nodes.' });
        }

        const newEdge = {
            from,
            to,
            label: label || null,
            type: type || 'main'
        };

        const dag = new DAG(workflow.definition.nodes, [...workflow.definition.edges, newEdge]);
        if (dag.detectCycles()) {
            return res.status(400).json({ 
                error: 'This connection would create a cycle in the workflow. Cycles are not allowed.' 
            });
        }

        await workflow.addEdge(newEdge);

        res.status(201).json({
            message: 'Edge added successfully',
            edge: newEdge,
            totalEdges: workflow.definition.edges.length
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// --- DELETE /workflows/:id/edges: Remove connection ---
export const deleteEdge = async (req, res) => {
    try {
        const { from, to } = req.body;

        if (!from || !to) {
            return res.status(400).json({ error: 'Both "from" and "to" node IDs are required.' });
        }

        const workflow = await Workflow.findById(req.params.id);
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        if (workflow.status === 'Published') {
            return res.status(400).json({ error: 'Cannot modify published workflow.' });
        }

        await workflow.removeEdge(from, to);

        res.json({
            message: 'Edge deleted successfully',
            remainingEdges: workflow.definition.edges.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// WORKFLOW EXECUTION
// ============================================

// --- Internal: Start workflow run helper ---
async function startWorkflowRun(workflow, initialContext = {}) {
    try {
        if (!workflow.definition?.nodes?.length) {
            throw new Error("Workflow has no nodes defined.");
        }

        const dag = new DAG(
            workflow.definition.nodes, 
            workflow.definition.edges || []
        );

        const startNodes = dag.getInitialNodes();

        if (startNodes.length === 0) {
            throw new Error("Workflow has no starting nodes (all nodes have predecessors).");
        }

        // Create execution context with unique ID
        const executionId = crypto.randomBytes(8).toString('hex');
        const executionContext = {
            ...initialContext,
            executionId,
            workflowId: workflow._id.toString(),
            startTime: new Date().toISOString()
        };

        const runRecord = await WorkflowRun.create({
            workflowId: workflow._id,
            userId: workflow.userId,
            status: 'RUNNING',
            startTime: new Date(),
            nodeLogs: [],
            completedNodes: [],
            nodeResults: {},
            context: executionContext
        });

        console.log(`[WORKFLOW] Starting execution ${executionId} with ${startNodes.length} initial nodes`);

        // Queue initial nodes
        await Promise.all(startNodes.map(nodeId => {
            return executionQueue.add('execute-node', {
                runId: runRecord._id.toString(),
                workflowDefinition: serializeDAG(dag),
                currentNodeId: nodeId,
                context: executionContext
            }, {
                removeOnComplete: true,
                removeOnFail: false,
            });
        }));

        console.log(`[WORKFLOW] Queued ${startNodes.length} initial nodes for execution`);

        return runRecord;

    } catch (error) {
        console.error('[WORKFLOW] Failed to start workflow run:', error);
        throw error;
    }
}

// --- POST /workflows/:id/publish: Publish workflow ---
export const publishWorkflow = async (req, res) => {
    try {
        const workflow = await Workflow.findById(req.params.id);

        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        if (!workflow.definition.nodes.length) {
            return res.status(400).json({ error: 'Cannot publish empty workflow.' });
        }

        const dag = new DAG(workflow.definition.nodes, workflow.definition.edges);
        if (dag.detectCycles()) {
            return res.status(400).json({ error: 'Workflow contains cycles.' });
        }

        if (dag.getInitialNodes().length === 0) {
            return res.status(400).json({ error: 'Workflow has no starting nodes.' });
        }
        
        if (workflow.status === 'Published') {
            return res.status(200).json(workflow);
        }

        workflow.status = 'Published';
        await workflow.save();
        
        res.json({
            message: 'Workflow published successfully',
            workflow: {
                id: workflow._id,
                name: workflow.name,
                status: workflow.status,
                webhookUrl: `/workflows/${workflow._id}/webhook/${workflow.webhookSecret}`
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- POST /workflows/:id/trigger: Manual trigger ---
export const manualTrigger = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const workflow = await Workflow.findOne({
            _id: req.params.id,
            userId
        });

        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found.' });
        }

        if (workflow.status !== 'Published') {
            return res.status(400).json({ error: 'Workflow must be published before execution.' });
        }

        const initialContext = {
            trigger: 'manual',
            payload: req.body || {},
            triggeredBy: userId.toString(),
            timestamp: new Date().toISOString(),
            triggerSource: 'api'
        };

        const runRecord = await startWorkflowRun(workflow, initialContext);

        // Update user usage (increment is handled by checkUsageLimit middleware)
        if (req.user.incrementUsage) {
            await req.user.incrementUsage();
        }

        res.status(202).json({
            message: 'Workflow execution started manually.',
            runId: runRecord._id,
            status: runRecord.status,
            executionId: runRecord.context.executionId
        });
    } catch (error) {
        console.error('[MANUAL TRIGGER] Failed:', error);
        res.status(500).json({ error: error.message });
    }
};

// --- POST /workflows/:id/start: Start workflow (alias for manual trigger) ---
export const startWorkflow = async (req, res) => {
    return manualTrigger(req, res);
};

// --- POST /workflows/:id/webhook/:secret: Webhook trigger ---
export const webhookTrigger = async (req, res) => {
    try {
        const { id: workflowId, secret } = req.params;
        
        const workflow = await Workflow.findOne({ 
            _id: workflowId, 
            webhookSecret: secret, 
            status: 'Published'
        });

        if (!workflow) {
            return res.status(404).json({ error: 'Invalid workflow ID or secret.' });
        }
        
        const initialContext = {
            trigger: 'webhook',
            payload: req.body || {},
            headers: req.headers,
            query: req.query,
            method: req.method,
            url: req.originalUrl,
            timestamp: new Date().toISOString(),
            triggerSource: 'webhook'
        };

        const runRecord = await startWorkflowRun(workflow, initialContext);

        res.status(202).json({ 
            message: 'Workflow execution started.', 
            runId: runRecord._id,
            status: runRecord.status,
            executionId: runRecord.context.executionId,
            queuedNodes: new DAG(workflow.definition.nodes, workflow.definition.edges || [])
                .getInitialNodes().length
        });
    } catch (error) {
        console.error('[WEBHOOK] Trigger failed:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// EXECUTION CONTROL
// ============================================

// --- POST /workflows/:id/runs/:runId/pause: Pause execution ---
export const pauseWorkflowRun = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const run = await WorkflowRun.findOne({
            _id: req.params.runId,
            workflowId: req.params.id,
            userId
        });

        if (!run) {
            return res.status(404).json({ error: 'Workflow run not found' });
        }

        if (run.status !== 'RUNNING') {
            return res.status(400).json({ 
                error: 'Can only pause running workflows',
                currentStatus: run.status
            });
        }

        run.status = 'PAUSED';
        await run.save();

        res.json({
            message: 'Workflow paused',
            runId: run._id,
            status: run.status
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- POST /workflows/:id/runs/:runId/resume: Resume execution ---
export const resumeWorkflowRun = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const workflow = await Workflow.findOne({ 
            _id: req.params.id, 
            userId 
        });

        const run = await WorkflowRun.findOne({
            _id: req.params.runId,
            workflowId: req.params.id,
            userId
        });

        if (!run) {
            return res.status(404).json({ error: 'Workflow run not found' });
        }

        if (run.status !== 'PAUSED') {
            return res.status(400).json({ 
                error: 'Can only resume paused workflows',
                currentStatus: run.status
            });
        }

        run.status = 'RUNNING';
        await run.save();

        // Find nodes that should be queued (completed predecessors but not completed themselves)
        const dag = new DAG(workflow.definition.nodes, workflow.definition.edges);
        const serializedWorkflow = serializeDAG(dag);

        const allNodeIds = workflow.definition.nodes.map(n => n.id);
        const incompletedNodes = allNodeIds.filter(id => !run.completedNodes.includes(id));

        // Queue nodes that are ready to execute
        const edgeMap = new Map();
        workflow.definition.edges.forEach(edge => {
            if (!edgeMap.has(edge.to)) edgeMap.set(edge.to, []);
            edgeMap.get(edge.to).push(edge.from);
        });

        const nodesToQueue = incompletedNodes.filter(nodeId => {
            const predecessors = edgeMap.get(nodeId) || [];
            return predecessors.every(pred => run.completedNodes.includes(pred));
        });

        await Promise.all(nodesToQueue.map(nodeId =>
            executionQueue.add('execute-node', {
                runId: run._id.toString(),
                workflowDefinition: serializedWorkflow,
                currentNodeId: nodeId,
                context: run.context,
            })
        ));

        res.json({
            message: 'Workflow resumed',
            runId: run._id,
            status: run.status,
            queuedNodes: nodesToQueue.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- POST /workflows/:id/runs/:runId/stop: Stop execution ---
export const stopWorkflowRun = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const run = await WorkflowRun.findOne({
            _id: req.params.runId,
            workflowId: req.params.id,
            userId
        });

        if (!run) {
            return res.status(404).json({ error: 'Workflow run not found' });
        }

        if (!['RUNNING', 'PAUSED'].includes(run.status)) {
            return res.status(400).json({ 
                error: 'Can only stop running or paused workflows',
                currentStatus: run.status
            });
        }

        run.status = 'STOPPED';
        run.endTime = new Date();
        await run.save();

        res.json({
            message: 'Workflow stopped',
            runId: run._id,
            status: run.status
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// RUN INFORMATION
// ============================================

// --- GET /workflows/:id/runs: List workflow runs ---
export const listRuns = async (req, res) => {
    try {
        const { id: workflowId } = req.params;
        const { limit = 50, skip = 0 } = req.query;
        const userId = req.user._id || req.user.id;

        const runs = await WorkflowRun.find({ 
            workflowId,
            userId 
        })
            .select('status startTime endTime completedNodes context')
            .sort({ startTime: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const workflow = await Workflow.findById(workflowId).select('definition.nodes');
        const totalNodes = workflow?.definition.nodes.length || 0;

        res.json({
            workflowId,
            runs: runs.map(run => ({
                id: run._id,
                status: run.status,
                executionId: run.context?.executionId,
                trigger: run.context?.trigger,
                startTime: run.startTime,
                endTime: run.endTime,
                duration: run.endTime ? run.endTime - run.startTime : null,
                progress: {
                    completed: run.completedNodes?.length || 0,
                    total: totalNodes,
                    percentage: totalNodes > 0 
                        ? Math.round((run.completedNodes.length / totalNodes) * 100)
                        : 0
                }
            })),
            total: runs.length,
            hasMore: runs.length === parseInt(limit)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- GET /workflows/:id/runs/:runId: Get single run details ---
export const getWorkflowRun = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const run = await WorkflowRun.findOne({
            _id: req.params.runId,
            workflowId: req.params.id,
            userId
        });
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found' });
        }

        const workflow = await Workflow.findById(run.workflowId);
        
        res.json({
            id: run._id,
            workflowId: run.workflowId,
            workflowName: workflow?.name || 'Unknown',
            status: run.status,
            executionId: run.context?.executionId,
            startTime: run.startTime,
            endTime: run.endTime,
            duration: run.endTime ? run.endTime - run.startTime : Date.now() - run.startTime,
            completedNodes: run.completedNodes,
            totalNodes: workflow?.definition.nodes.length || 0,
            nodeResults: run.nodeResults,
            nodeLogs: run.nodeLogs,
            context: run.context
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Fixed getRunLogs with proper null checks
export const getRunLogs = async (req, res) => {
    try {
        // Validate authentication
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const run = await WorkflowRun.findById(req.params.id);
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found.' });
        }

        // Safely extract userId with null checks
        const userId = req.user._id || req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in authentication token' });
        }

        // Safely check run ownership
        if (!run.userId) {
            return res.status(500).json({ error: 'Run missing userId field' });
        }

        // Convert both to strings for comparison
        const runUserId = run.userId.toString();
        const requestUserId = userId.toString();

        if (runUserId !== requestUserId) {
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'You do not have permission to view this run'
            });
        }

        const workflow = await Workflow.findById(run.workflowId);

        // Generate execution summary
        const summary = ExecutionLogger.summarize(run.nodeLogs || []);

        res.json({
            id: run._id,
            workflowId: run.workflowId,
            workflowName: workflow?.name || 'Unknown',
            status: run.status,
            executionId: run.context?.executionId,
            startTime: run.startTime,
            endTime: run.endTime,
            duration: run.endTime ? run.endTime - run.startTime : Date.now() - run.startTime,
            completedNodes: run.completedNodes,
            totalNodes: workflow?.definition.nodes.length || 0,
            progress: workflow?.definition.nodes.length 
                ? Math.round((run.completedNodes.length / workflow.definition.nodes.length) * 100)
                : 0,
            nodeResults: run.nodeResults,
            logs: run.nodeLogs,
            summary: summary,
            context: {
                trigger: run.context?.trigger,
                executionId: run.context?.executionId
            }
        });
    } catch (error) {
        console.error('[GET_RUN_LOGS] Error:', error);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to retrieve run logs'
        });
    }
};

// Also fix getRunStatus
export const getRunStatus = async (req, res) => {
    try {
        // Validate authentication
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const run = await WorkflowRun.findById(req.params.id)
            .select('status startTime endTime completedNodes nodeResults context workflowId userId');
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found.' });
        }

        // Safely extract userId
        const userId = req.user._id || req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in authentication token' });
        }

        // Verify user ownership with null checks
        if (!run.userId) {
            return res.status(500).json({ error: 'Run missing userId field' });
        }

        if (run.userId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const workflow = await Workflow.findById(run.workflowId).select('definition.nodes');
        const totalNodes = workflow?.definition.nodes.length || 0;

        res.json({
            id: run._id,
            status: run.status,
            executionId: run.context?.executionId,
            startTime: run.startTime,
            endTime: run.endTime,
            duration: run.endTime ? run.endTime - run.startTime : Date.now() - run.startTime,
            progress: {
                completed: run.completedNodes?.length || 0,
                total: totalNodes,
                percentage: totalNodes > 0 
                    ? Math.round((run.completedNodes.length / totalNodes) * 100)
                    : 0
            },
            nodeResults: run.nodeResults,
            resultsSummary: {
                totalResults: Object.keys(run.nodeResults || {}).length,
                nodeIds: Object.keys(run.nodeResults || {})
            }
        });
    } catch (error) {
        console.error('[GET_RUN_STATUS] Error:', error);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to retrieve run status'
        });
    }
};

// Fix getNodeResult
export const getNodeResult = async (req, res) => {
    try {
        // Validate authentication
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { id: runId, nodeId } = req.params;
        
        const run = await WorkflowRun.findById(runId)
            .select('nodeResults nodeLogs userId');
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found.' });
        }

        // Safely extract userId
        const userId = req.user._id || req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in authentication token' });
        }

        // Verify user ownership
        if (!run.userId) {
            return res.status(500).json({ error: 'Run missing userId field' });
        }

        if (run.userId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = run.nodeResults?.[nodeId];
        
        if (result === undefined) {
            return res.status(404).json({ 
                error: 'Node result not found.',
                availableNodes: Object.keys(run.nodeResults || {})
            });
        }

        // Find corresponding log entry
        const logEntry = run.nodeLogs?.find(log => log.nodeId === nodeId);

        res.json({
            runId: run._id,
            nodeId: nodeId,
            result: result,
            metadata: logEntry ? {
                status: logEntry.status,
                startTime: logEntry.startTime,
                endTime: logEntry.endTime,
                duration: logEntry.duration,
                outputPreview: logEntry.outputPreview
            } : null
        });
    } catch (error) {
        console.error('[GET_NODE_RESULT] Error:', error);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to retrieve node result'
        });
    }
};

// Fix getRunTimeline
export const getRunTimeline = async (req, res) => {
    try {
        // Validate authentication
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const run = await WorkflowRun.findById(req.params.id);
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found.' });
        }

        // Safely extract userId
        const userId = req.user._id || req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in authentication token' });
        }

        // Verify user ownership
        if (!run.userId) {
            return res.status(500).json({ error: 'Run missing userId field' });
        }

        if (run.userId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Use enhanced schema's timeline method
        const timeline = run.getExecutionTimeline ? run.getExecutionTimeline() : [];

        res.json({
            runId: run._id,
            executionId: run.context?.executionId,
            status: run.status,
            timeline: timeline,
            summary: {
                startTime: run.startTime,
                endTime: run.endTime,
                totalDuration: run.duration,
                nodes: timeline.length
            }
        });
    } catch (error) {
        console.error('[GET_RUN_TIMELINE] Error:', error);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to retrieve run timeline'
        });
    }
};

// Fix getRunSummary
export const getRunSummary = async (req, res) => {
    try {
        // Validate authentication
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const run = await WorkflowRun.findById(req.params.id);
        
        if (!run) {
            return res.status(404).json({ error: 'Run not found.' });
        }

        // Safely extract userId
        const userId = req.user._id || req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in authentication token' });
        }

        // Verify user ownership
        if (!run.userId) {
            return res.status(500).json({ error: 'Run missing userId field' });
        }

        if (run.userId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Use enhanced schema's summary method
        const summary = run.getSummary ? run.getSummary() : {
            id: run._id,
            status: run.status,
            startTime: run.startTime,
            endTime: run.endTime
        };

        res.json(summary);
    } catch (error) {
        console.error('[GET_RUN_SUMMARY] Error:', error);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to retrieve run summary'
        });
    }
};
// ============================================
// UTILITY
// ============================================

export const ensureDbConnection = async () => {
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState !== 1) {
        throw new Error('Database connection not established');
    }
};