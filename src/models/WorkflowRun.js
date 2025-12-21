// src/models/WorkflowRun.js
import mongoose from 'mongoose';

// Execution log schema for detailed tracking
const executionLogSchema = new mongoose.Schema({
    nodeId: {
        type: String,
        required: true
    },
    nodeType: {
        type: String,
        required: true
    },
    nodeLabel: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['queued', 'waiting', 'running', 'success', 'failed', 'skipped'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        required: true
    },
    duration: {
        type: Number, // in milliseconds
        default: null
    },
    input: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    output: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    error: {
        type: String,
        default: null
    },
    errorStack: {
        type: String,
        default: null
    },
    metadata: {
        type: {
            attemptNumber: { type: Number, default: 1 },
            workerId: { type: Number, default: null },
            jobId: { type: String, default: null },
            predecessors: { type: [String], default: [] },
            triggeredBy: { type: String, default: null },
            waitingFor: { type: [String], default: [] },
            completedPredecessors: { type: [String], default: [] },
            trigger: { type: String, default: null },
            position: { type: String, default: null },
            outputSize: { type: Number, default: null },
            totalNodes: { type: Number, default: null },
            completedNodes: { type: Number, default: null },
            reason: { type: String, default: null },
            maxAttempts: { type: Number, default: null }
        },
        default: {}
    }
}, { _id: false });

const workflowRunSchema = new mongoose.Schema({
    workflowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workflow',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'],
        default: 'QUEUED',
        index: true
    },
    startTime: {
        type: Date,
        default: Date.now,
        index: true
    },
    endTime: {
        type: Date,
        default: null
    },
    completedNodes: {
        type: [String],
        default: []
    },
    nodeResults: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    context: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    nodeLogs: {
        type: [executionLogSchema],
        default: []
    },
    // Summary statistics (computed)
    statistics: {
        totalNodes: { type: Number, default: 0 },
        completedNodes: { type: Number, default: 0 },
        failedNodes: { type: Number, default: 0 },
        skippedNodes: { type: Number, default: 0 },
        totalDuration: { type: Number, default: 0 }, // in milliseconds
        averageNodeDuration: { type: Number, default: 0 }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for better query performance
workflowRunSchema.index({ workflowId: 1, status: 1 });
workflowRunSchema.index({ userId: 1, startTime: -1 });
workflowRunSchema.index({ startTime: -1 });
workflowRunSchema.index({ 'nodeLogs.nodeId': 1 });
workflowRunSchema.index({ 'nodeLogs.status': 1 });

// Virtual for duration
workflowRunSchema.virtual('duration').get(function() {
    if (this.endTime && this.startTime) {
        return this.endTime - this.startTime;
    }
    if (this.startTime) {
        return Date.now() - this.startTime;
    }
    return null;
});

// Virtual for progress percentage
workflowRunSchema.virtual('progressPercentage').get(function() {
    if (this.statistics.totalNodes === 0) return 0;
    return Math.round((this.completedNodes.length / this.statistics.totalNodes) * 100);
});

// Method to get logs for a specific node
workflowRunSchema.methods.getNodeLogs = function(nodeId) {
    return this.nodeLogs.filter(log => log.nodeId === nodeId);
};

// Method to get logs by status
workflowRunSchema.methods.getLogsByStatus = function(status) {
    return this.nodeLogs.filter(log => log.status === status);
};

// Method to get execution timeline
workflowRunSchema.methods.getExecutionTimeline = function() {
    return this.nodeLogs
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(log => ({
            nodeId: log.nodeId,
            nodeLabel: log.nodeLabel,
            status: log.status,
            timestamp: log.timestamp,
            duration: log.duration
        }));
};

// Method to compute statistics
workflowRunSchema.methods.computeStatistics = function() {
    const successfulNodes = this.nodeLogs.filter(log => log.status === 'success');
    const failedNodes = this.nodeLogs.filter(log => log.status === 'failed');
    const skippedNodes = this.nodeLogs.filter(log => log.status === 'skipped');
    
    const totalDuration = successfulNodes.reduce((sum, log) => sum + (log.duration || 0), 0);
    const averageDuration = successfulNodes.length > 0 
        ? totalDuration / successfulNodes.length 
        : 0;

    this.statistics = {
        totalNodes: this.completedNodes.length,
        completedNodes: successfulNodes.length,
        failedNodes: failedNodes.length,
        skippedNodes: skippedNodes.length,
        totalDuration,
        averageNodeDuration: Math.round(averageDuration)
    };

    return this.statistics;
};

// Pre-save hook to update statistics
workflowRunSchema.pre('save', function() {
    if (this.isModified('nodeLogs') || this.isModified('completedNodes')) {
        this.computeStatistics();
    }
});

// Method to add execution log
workflowRunSchema.methods.addLog = function(log) {
    this.nodeLogs.push(log);
    return this.save();
};

// Method to get summary
workflowRunSchema.methods.getSummary = function() {
    return {
        id: this._id,
        workflowId: this.workflowId,
        status: this.status,
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.duration,
        progress: this.progressPercentage,
        statistics: this.statistics,
        completedNodes: this.completedNodes.length,
        totalLogs: this.nodeLogs.length
    };
};

// Static method to get run with detailed logs
workflowRunSchema.statics.getDetailedRun = async function(runId) {
    const run = await this.findById(runId).populate('workflowId', 'name description');
    if (!run) return null;

    const timeline = run.getExecutionTimeline();
    const summary = run.getSummary();
    
    return {
        ...summary,
        workflowName: run.workflowId?.name,
        workflowDescription: run.workflowId?.description,
        timeline,
        logs: run.nodeLogs,
        nodeResults: run.nodeResults,
        context: run.context
    };
};

// Static method to get recent runs
workflowRunSchema.statics.getRecentRuns = async function(workflowId, limit = 10) {
    return this.find({ workflowId })
        .sort({ startTime: -1 })
        .limit(limit)
        .select('status startTime endTime completedNodes statistics')
        .lean();
};

const WorkflowRun = mongoose.model('WorkflowRun', workflowRunSchema);

export default WorkflowRun;