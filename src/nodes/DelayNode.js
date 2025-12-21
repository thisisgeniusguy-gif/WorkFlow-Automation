// src/workflow/nodes/DelayNode.js
import { BaseNode, resolveTemplate } from './BaseNode.js';

export class DelayNode extends BaseNode {
    static TYPE = 'delay';
    static NAME = 'Delay';
    static DESCRIPTION = 'Pause workflow execution for a specified duration';
    
    static CONFIG_SCHEMA = {
        duration: { 
            type: 'number', 
            required: true, 
            min: 1,
            max: 3600,
            description: 'Delay duration in seconds (1-3600)'
        },
        unit: { 
            type: 'string', 
            required: false, 
            default: 'seconds',
            enum: ['seconds', 'minutes'],
            description: 'Time unit'
        }
    };

    constructor(label, config) {
        super(DelayNode.TYPE, label, config);
    }

    validate() {
        let { duration, unit } = this.config;

        if (duration === undefined || duration === null) {
            throw new Error('Delay node requires a duration');
        }

        duration = Number(duration);

        if (isNaN(duration) || duration < 1) {
            throw new Error('Duration must be at least 1 second');
        }

        // Convert minutes to seconds if needed
        if (unit === 'minutes') {
            duration = duration * 60;
        }

        // Max 1 hour (3600 seconds)
        if (duration > 3600) {
            throw new Error('Maximum delay is 3600 seconds (1 hour)');
        }

        return {
            duration: Math.floor(duration), // Ensure integer
            unit: 'seconds' // Always store as seconds internally
        };
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async execute(context) {
        try {
            // Resolve duration if it's a template
            let duration = this.config.duration;
            if (typeof duration === 'string') {
                const resolved = resolveTemplate(duration, context);
                duration = Number(resolved);
            }

            if (isNaN(duration) || duration < 1) {
                throw new Error('Invalid duration after template resolution');
            }

            // Cap at max limit
            duration = Math.min(duration, 3600);

            const milliseconds = duration * 1000;
            const startTime = Date.now();

            console.log(`[Delay Node] Sleeping for ${duration} seconds`);

            await this.sleep(milliseconds);

            const actualDuration = (Date.now() - startTime) / 1000;

            console.log(`[Delay Node] Completed after ${actualDuration.toFixed(2)} seconds`);

            return {
                success: true,
                requestedDuration: duration,
                actualDuration: actualDuration.toFixed(2),
                unit: 'seconds',
                startedAt: new Date(startTime).toISOString(),
                completedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error(`[Delay Node] Execution failed:`, error.message);

            return {
                success: false,
                error: error.message,
                executedAt: new Date().toISOString()
            };
        }
    }

    static create(label, config) {
        const node = new DelayNode(label, config);
        node.validate();
        return node;
    }
}

export default DelayNode;