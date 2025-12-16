import { Schema, model } from 'mongoose';

const WorkflowRunSchema = new Schema({
    _id: { type: Schema.Types.ObjectId, auto: true },
    workflowId: { type: Schema.Types.ObjectId, required: true, ref: 'Workflow' },
    status: { type: String, enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED'], default: 'PENDING' },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    nodeLogs: { type: Array, default: [] }
}, { 
    timestamps: true,
    indexes: [{ workflowId: 1 }]
});

export default model('WorkflowRun', WorkflowRunSchema);