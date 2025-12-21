// src/models/Workflow.js
import mongoose from 'mongoose';

// Define schemas for nodes and edges for better type safety
const nodeSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['http_request', 'conditional', 'delay', 'notification']
    },
    label: {
        type: String,
        required: true
    },
    config: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    position: {
        type: {
            x: { type: Number, default: 0 },
            y: { type: Number, default: 0 }
        },
        default: { x: 0, y: 0 }
    }
}, { _id: false }); // Don't create _id for subdocuments

const edgeSchema = new mongoose.Schema({
    from: {
        type: String,
        required: true
    },
    to: {
        type: String,
        required: true
    },
    label: {
        type: String,
        default: null
    }
}, { _id: false });

const definitionSchema = new mongoose.Schema({
    nodes: {
        type: [nodeSchema],
        default: []
    },
    edges: {
        type: [edgeSchema],
        default: []
    }
}, { _id: false });

const workflowSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        default: '',
        maxlength: 1000
    },
    definition: {
        type: definitionSchema,
        default: () => ({ nodes: [], edges: [] })
    },
    webhookSecret: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    cronSchedule: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['Draft', 'Published', 'Archived'],
        default: 'Draft',
        index: true
    }
}, {
    timestamps: true,
    // Ensure virtuals are included when converting to JSON
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for better query performance
workflowSchema.index({ userId: 1, status: 1 });
workflowSchema.index({ createdAt: -1 });

// Virtual for webhook URL
workflowSchema.virtual('webhookUrl').get(function() {
    return `/api/workflows/${this._id}/webhook/${this.webhookSecret}`;
});

// Method to add node
workflowSchema.methods.addNode = function(node) {
    this.definition.nodes.push(node);
    return this.save();
};

// Method to remove node
workflowSchema.methods.removeNode = function(nodeId) {
    this.definition.nodes = this.definition.nodes.filter(n => n.id !== nodeId);
    this.definition.edges = this.definition.edges.filter(
        e => e.from !== nodeId && e.to !== nodeId
    );
    return this.save();
};

// Method to add edge
workflowSchema.methods.addEdge = function(edge) {
    this.definition.edges.push(edge);
    return this.save();
};

// Method to remove edge
workflowSchema.methods.removeEdge = function(from, to) {
    this.definition.edges = this.definition.edges.filter(
        e => !(e.from === from && e.to === to)
    );
    return this.save();
};

// Pre-save hook to ensure definition exists
workflowSchema.pre('save', function() {
    if (!this.definition) {
        this.definition = { nodes: [], edges: [] };
    }
    if (!this.definition.nodes) {
        this.definition.nodes = [];
    }
    if (!this.definition.edges) {
        this.definition.edges = [];
    }
});

const Workflow = mongoose.model('Workflow', workflowSchema);

export default Workflow;