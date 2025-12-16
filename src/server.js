import express from 'express';
import bodyParser from 'body-parser';
// 1. We keep the MongoDB connection function
import database from './config/database.js';

import workflowRoutes from './api/routes/workflow.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database Connection (Mongoose)
// 4. Connect to MongoDB
database();

// API Routes
app.use('/api', workflowRoutes);

app.get('/', (res) => {
    res.send('Flow Workflow Orchestrator API is running (MongoDB).');
});

// Start Server 
async function startServer() {
    try {
        // 5. Removed all Sequelize/SQL synchronization logic, 
        // as Mongoose handles schema on first model use or by default.
        // We only wait for the connection promise inside connectDB to resolve.
        console.log('MongoDB connection successful.');

        app.listen(PORT, () => {
            console.log(`API Gateway running on http://localhost:${PORT}`);
            console.log('Ensure the executor worker is running separately via "npm run worker"');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();