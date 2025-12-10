const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./config/database'); 
const workflowRoutes = require('./api/routes/workflow.routes'); 
const Workflow = require('./models/Workflow');
const WorkflowRun = require('./models/WorkflowRun');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API Routes
app.use('/api', workflowRoutes);

app.get('/', (req, res) => {
    res.send('Flow Workflow Orchestrator API is running.');
});

// Start Server and Database Sync
async function startServer() {
    try {
        // Initialize Models and Tables
        Workflow.associate = (models) => {
            Workflow.hasMany(models.WorkflowRun, { foreignKey: 'workflowId' });
        };
        WorkflowRun.associate = (models) => {
            WorkflowRun.belongsTo(models.Workflow, { foreignKey: 'workflowId' });
        };
        
        // Sync models with the database (creates tables if they don't exist)
        await sequelize.sync({ alter: true }); 
        console.log('Database connection and synchronization successful.');

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