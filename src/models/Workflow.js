import { Schema, model } from 'mongoose';

const workflowSchema = new Schema({
    _id: { type: Schema.Types.ObjectId, auto: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    definition: { type: Object, required: true },
    status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' },
    webhookSecret: { type: String, default: null },
    cronSchedule: { type: String, required: true},
}, { 
    timestamps: true
});

const Workflow = model('Workflow', workflowSchema);

export default Workflow;
