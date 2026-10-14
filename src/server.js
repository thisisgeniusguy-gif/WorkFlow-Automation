import express from 'express';
import bodyParser from 'body-parser';
// 1. We keep the MongoDB connection function
import database from './config/database.js';
import dotenv from 'dotenv';
import cors from 'cors';
import workflowRoutes from './api/routes/workflow.routes.js';
import authRoutes from './api/routes/auth.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
const corsOptions ={
    origin: process.env.CORS_ORIGIN, 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200
}
app.use(cors(corsOptions));


// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    const newLocal = res.send('Flow Workflow Orchestrator API is running (MongoDB).');
    return newLocal;
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
// API Routes
app.use('/api', workflowRoutes);


// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Error handler
app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
});
// Start Server 
async function startServer() {
    try {
        await database();
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



export default app;
