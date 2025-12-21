// src/config/queue.config.js
import { Queue } from 'bullmq';
import database from './database.js';
const connection = {
  host: "redis",  // This matches the service name in your docker-compose.yml
  port: 6379      // Standard Redis port
};

// Define the queue for workflow execution jobs
const executionQueue = new Queue('workflow-execution', { connection });
// Connect to MongoDB
database();

// Event handlers for queue
executionQueue.on('completed', async (job) => {
    console.log(`Job ${job.id} completed`);
});

executionQueue.on('failed', async (job, err) => {
    console.log(`Job ${job.id} failed: ${err.message}`);
});

executionQueue.on('error', (err) => {
    console.error('Queue error:', err);
});

export { executionQueue, connection };