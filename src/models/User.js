// models/User.js - Fixed version without next() issues
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Fair usage tracking
    usage: {
        workflowsCreated: { type: Number, default: 0 },
        workflowExecutions: { type: Number, default: 0 },
        lastExecutionTime: { type: Date },
        monthlyExecutions: { type: Number, default: 0 },
        monthlyResetDate: { type: Date, default: Date.now }
    },
    // Usage limits
    limits: {
        maxWorkflows: { type: Number, default: 10 },
        maxExecutionsPerMonth: { type: Number, default: 1000 },
        maxExecutionsPerHour: { type: Number, default: 100 }
    }
}, {
    timestamps: true
});

// Hash password before saving - MODERN ASYNC/AWAIT PATTERN (no next needed)
userSchema.pre('save', async function() {
    // Only hash if password is modified
    if (!this.isModified('password')) {
        return;
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    // No need to call next() with async functions
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user is within usage limits
userSchema.methods.canExecuteWorkflow = function() {
    // Reset monthly counter if needed
    const now = new Date();
    const resetDate = new Date(this.usage.monthlyResetDate);
    
    // Check if we need to reset monthly counters
    if (now.getMonth() !== resetDate.getMonth() || 
        now.getFullYear() !== resetDate.getFullYear()) {
        this.usage.monthlyExecutions = 0;
        this.usage.monthlyResetDate = now;
    }

    // Check monthly limit
    if (this.usage.monthlyExecutions >= this.limits.maxExecutionsPerMonth) {
        return { 
            allowed: false, 
            reason: 'Monthly execution limit reached',
            limit: this.limits.maxExecutionsPerMonth,
            current: this.usage.monthlyExecutions
        };
    }

    // Check hourly limit (simplified - would need more sophisticated tracking)
    if (this.usage.lastExecutionTime) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (this.usage.lastExecutionTime > hourAgo) {
            // In production, you'd track executions per hour properly
            // For now, we just allow it
            return { allowed: true };
        }
    }

    return { allowed: true };
};

// Increment usage counters
userSchema.methods.incrementUsage = async function() {
    this.usage.workflowExecutions += 1;
    this.usage.monthlyExecutions += 1;
    this.usage.lastExecutionTime = new Date();
    
    // Save without validation to avoid triggering password hash again
    await this.save({ validateBeforeSave: false });
};

export default mongoose.model('User', userSchema);