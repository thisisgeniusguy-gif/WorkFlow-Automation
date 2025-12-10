// src/config/queue.config.js
const { Queue } = require('bullmq');
const { connection } = require('./database'); // Get Redis connection details

// Define the queue for workflow execution jobs
const executionQueue = new Queue('workflow-execution', { connection });

module.exports = { executionQueue, connection };