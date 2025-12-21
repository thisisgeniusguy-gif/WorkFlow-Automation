# 🔄 Workflow Automation Tool - FLOW

A powerful, scalable workflow automation platform inspired by n8n, built with Node.js, MongoDB, and Redis. Create, manage, and execute complex workflows with a visual node-based interface backed by a robust DAG (Directed Acyclic Graph) execution engine.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Workflow Concepts](#workflow-concepts)
- [Design Patterns](#design-patterns)
- [Usage Examples](#usage-examples)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## ✨ Features

### Core Capabilities

- **📊 Visual Workflow Builder**: Create workflows using a node-based visual interface
- **🔗 DAG Execution Engine**: Reliable, parallel execution using Directed Acyclic Graphs
- **🔄 Result Passing**: Seamlessly pass data between nodes for complex transformations
- **⚡ Redis Queue System**: Distributed, fault-tolerant task execution with BullMQ
- **📡 Multiple Triggers**: 
  - Manual execution via API
  - Webhook-based triggers
  - Scheduled execution (Cron)
- **🎮 Execution Control**: Pause, resume, and stop running workflows
- **📝 Comprehensive Logging**: Detailed execution logs with result tracking
- **🔐 Secure**: JWT-based authentication and webhook secret validation
- **📈 Scalable**: Horizontal scaling with multiple worker processes

### Advanced Features

- **Conditional Branching**: Route execution based on data evaluation
- **Data Transformation**: Built-in nodes for filtering, mapping, and aggregating
- **Error Handling**: Automatic retries with exponential backoff
- **Real-time Monitoring**: Track workflow execution in real-time
- **Result Persistence**: Store and retrieve node execution results
- **User Isolation**: Multi-tenant architecture with user-based access control

---

## 🏗️ Architecture

### System Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  REST API   │────▶│   MongoDB   │
│   (React)   │     │  (Express)  │     │  (Workflows)│
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │Redis Queue  │────▶│   Workers   │
                    │  (BullMQ)   │     │  (Executor) │
                    └─────────────┘     └─────────────┘
```

### Data Flow

```
1. User creates workflow with nodes and edges
2. Workflow published → Status: "Published"
3. Trigger (Manual/Webhook/Cron) → Creates WorkflowRun
4. Initial nodes queued in Redis
5. Workers execute nodes, pass results to successors
6. Completed nodes trigger successor execution
7. Workflow completes when all nodes finish
```

### DAG Execution Model

```
     [Node A]
        │
        ├────────┬─────────┐
        ▼        ▼         ▼
    [Node B] [Node C]  [Node D]
        │        │         │
        └────────┴─────────┘
                 ▼
             [Node E]

Execution: A → (B,C,D in parallel) → E
```

---

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB (with Mongoose ODM)
- **Queue**: Redis + BullMQ
- **Scheduler**: node-cron
- **Authentication**: JWT (JSON Web Tokens)

### Key Libraries
- `bullmq`: Distributed job queue
- `mongoose`: MongoDB object modeling
- `express`: Web application framework
- `node-cron`: Cron job scheduling
- `dotenv`: Environment configuration
- `crypto`: Secure webhook secret generation

---

## 📁 Project Structure

```
workflow-automation/
├── src/
│   ├── api/
│   │   ├── controllers/
│   │   │   └── workflow.controller.js      # Main controller with all endpoints
│   │   ├── middleware/
│   │   │   ├── auth.js                     # Authentication & authorization
│   │   │   └── validation.middleware.js    # Input validation
│   │   └── routes/
│   │       └── workflow.routes.js          # API route definitions
│   │
│   ├── config/
│   │   ├── database.js                     # MongoDB connection config
│   │   └── queue.config.js                 # Redis/BullMQ configuration
│   │
│   ├── models/
│   │   ├── Workflow.js                     # Workflow schema & methods
│   │   ├── WorkflowRun.js                  # Execution run schema
│   │   └── User.js                         # User schema
│   │
│   ├── nodes/
│   │   ├── NodeFactory.js                  # Node type registry & executor
│   │   ├── HttpRequestNode.js              # HTTP API call node
│   │   ├── DataTransformNode.js            # Data transformation node
│   │   ├── ConditionalNode.js              # Conditional branching
│   │   ├── EmailNode.js                    # Email sending node
│   │   └── AggregationNode.js              # Data aggregation node
│   │
│   ├── utils/
│   │   ├── ExecutionLogger.js              # Logging & result passing
│   │   └── validators.js                   # Input validators
│   │
│   ├── workers/
│   │   └── executor.worker.js              # BullMQ worker process
│   │
│   ├── app.js                              # Express app setup
│   └── server.js                           # Server entry point
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example                            # Environment variables template
├── .gitignore
├── package.json
├── README.md
└── docker-compose.yml                      # Docker setup (MongoDB, Redis)
```

---

## 🚀 Installation

### Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- Redis >= 6.0
- npm or yarn

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/workflow-automation.git
   cd workflow-automation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB and Redis** (using Docker)
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations** (if applicable)
   ```bash
   npm run migrate
   ```

6. **Start the application**
   ```bash
   # Development mode (with hot reload)
   npm run dev

   # Production mode
   npm start
   ```

7. **Start worker process** (in a separate terminal)
   ```bash
   npm run worker
   ```

### Docker Setup

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/workflow_db

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_JOBS_PER_SECOND=100

# Timezone (for cron jobs)
TZ=UTC

# Worker Configuration
MAX_RETRIES=3
RETRY_BACKOFF_MS=1000
```

---

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

### 🔷 Workflow Management

#### Create Workflow
```http
POST /workflows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Workflow",
  "description": "Workflow description",
  "cronSchedule": "0 0 * * *"  // Optional
}

Response: 201 Created
{
  "id": "workflow_id",
  "name": "My Workflow",
  "webhookSecret": "generated_secret",
  "webhookUrl": "/workflows/{id}/webhook/{secret}",
  "status": "Draft"
}
```

#### List Workflows
```http
GET /workflows
Authorization: Bearer <token>

Response: 200 OK
{
  "workflows": [
    {
      "id": "workflow_id",
      "name": "My Workflow",
      "status": "Published",
      "nodeCount": 5,
      "edgeCount": 4
    }
  ],
  "total": 1
}
```

#### Get Workflow
```http
GET /workflows/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "workflow_id",
  "name": "My Workflow",
  "nodes": [...],
  "edges": [...],
  "status": "Published"
}
```

#### Update Workflow
```http
PUT /workflows/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "New description"
}

Response: 200 OK
```

#### Delete Workflow
```http
DELETE /workflows/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Workflow deleted successfully"
}
```

---

### 🔷 Node Management

#### Get Available Node Types
```http
GET /workflows/node-types
Authorization: Bearer <token>

Response: 200 OK
{
  "nodeTypes": ["http_request", "data_transform", "conditional", "email"],
  "schemas": {
    "http_request": {
      "type": "http_request",
      "label": "HTTP Request",
      "config": {...}
    }
  }
}
```

#### Add Node to Workflow
```http
POST /workflows/:id/nodes
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "http_request",
  "label": "Fetch User Data",
  "config": {
    "url": "https://api.example.com/users",
    "method": "GET"
  }
}

Response: 201 Created
{
  "message": "Node added successfully",
  "node": {
    "id": "node_123456",
    "type": "http_request",
    "label": "Fetch User Data"
  }
}
```

#### Update Node
```http
PUT /workflows/:id/nodes/:nodeId
Authorization: Bearer <token>
Content-Type: application/json

{
  "label": "Updated Label",
  "config": {
    "url": "https://api.example.com/v2/users"
  }
}

Response: 200 OK
```

#### Delete Node
```http
DELETE /workflows/:id/nodes/:nodeId
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Node deleted successfully",
  "remainingNodes": 4
}
```

---

### 🔷 Edge Management (Connections)

#### Connect Nodes
```http
POST /workflows/:id/edges
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "node_123456",
  "to": "node_789012",
  "label": "On Success",
  "type": "main"
}

Response: 201 Created
{
  "message": "Edge added successfully",
  "edge": {...}
}
```

#### Delete Connection
```http
DELETE /workflows/:id/edges
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "node_123456",
  "to": "node_789012"
}

Response: 200 OK
```

---

### 🔷 Workflow Execution

#### Publish Workflow
```http
PUT /workflows/:id/publish
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Workflow published successfully",
  "workflow": {
    "id": "workflow_id",
    "status": "Published"
  }
}
```

#### Manual Trigger
```http
POST /workflows/:id/trigger
Authorization: Bearer <token>
Content-Type: application/json

{
  "inputData": {
    "userId": 123,
    "action": "process"
  }
}

Response: 202 Accepted
{
  "message": "Workflow execution started",
  "runId": "run_abc123",
  "executionId": "exec_xyz789",
  "status": "RUNNING"
}
```

#### Webhook Trigger
```http
POST /workflows/:id/webhook/:secret
Content-Type: application/json

{
  "data": "webhook payload"
}

Response: 202 Accepted
{
  "message": "Workflow execution started",
  "runId": "run_abc123"
}
```

---

### 🔷 Execution Control

#### Pause Workflow Run
```http
POST /workflows/:id/runs/:runId/pause
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Workflow paused",
  "runId": "run_abc123",
  "status": "PAUSED"
}
```

#### Resume Workflow Run
```http
POST /workflows/:id/runs/:runId/resume
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Workflow resumed",
  "runId": "run_abc123",
  "queuedNodes": 3
}
```

#### Stop Workflow Run
```http
POST /workflows/:id/runs/:runId/stop
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Workflow stopped",
  "status": "STOPPED"
}
```

---

### 🔷 Execution Monitoring

#### List Workflow Runs
```http
GET /workflows/:id/runs?limit=20&skip=0
Authorization: Bearer <token>

Response: 200 OK
{
  "workflowId": "workflow_id",
  "runs": [
    {
      "id": "run_abc123",
      "status": "COMPLETED",
      "executionId": "exec_xyz789",
      "startTime": "2024-01-01T10:00:00Z",
      "endTime": "2024-01-01T10:05:23Z",
      "progress": {
        "completed": 5,
        "total": 5,
        "percentage": 100
      }
    }
  ]
}
```

#### Get Run Status
```http
GET /runs/:id/status
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "run_abc123",
  "status": "RUNNING",
  "executionId": "exec_xyz789",
  "progress": {
    "completed": 3,
    "total": 5,
    "percentage": 60
  }
}
```

#### Get Run Logs (Detailed)
```http
GET /runs/:id/logs
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "run_abc123",
  "workflowName": "My Workflow",
  "status": "COMPLETED",
  "completedNodes": ["node_1", "node_2", "node_3"],
  "logs": [
    {
      "nodeId": "node_1",
      "nodeLabel": "Fetch Data",
      "status": "success",
      "duration": 1234,
      "output": {...}
    }
  ],
  "nodeResults": {
    "node_1": {...},
    "node_2": {...}
  }
}
```

#### Get Node Result
```http
GET /runs/:id/nodes/:nodeId/result
Authorization: Bearer <token>

Response: 200 OK
{
  "runId": "run_abc123",
  "nodeId": "node_1",
  "result": {
    "data": "node output",
    "status": "success"
  },
  "metadata": {
    "duration": 1234,
    "timestamp": "2024-01-01T10:00:00Z"
  }
}
```

#### Get Run Timeline
```http
GET /runs/:id/timeline
Authorization: Bearer <token>

Response: 200 OK
{
  "runId": "run_abc123",
  "timeline": [
    {
      "time": "10:00:00",
      "event": "Node Started",
      "nodeId": "node_1"
    }
  ]
}
```

#### Get Run Summary
```http
GET /runs/:id/summary
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "run_abc123",
  "status": "COMPLETED",
  "totalNodes": 5,
  "successfulNodes": 5,
  "failedNodes": 0,
  "totalDuration": 15432
}
```

---

## 💡 Workflow Concepts

### Nodes

Nodes are the building blocks of workflows. Each node performs a specific task.

**Available Node Types:**

1. **HTTP Request Node**: Make API calls
   ```javascript
   {
     "type": "http_request",
     "config": {
       "url": "https://api.example.com/data",
       "method": "GET",
       "headers": {"Authorization": "Bearer token"}
     }
   }
   ```

2. **Data Transform Node**: Transform data
   ```javascript
   {
     "type": "data_transform",
     "config": {
       "operation": "map",
       "expression": "item.userId"
     }
   }
   ```

3. **Conditional Node**: Branch based on conditions
   ```javascript
   {
     "type": "conditional",
     "config": {
       "condition": "results.node_1.status === 'success'"
     }
   }
   ```

4. **Email Node**: Send emails
   ```javascript
   {
     "type": "email",
     "config": {
       "to": "user@example.com",
       "subject": "Workflow Complete",
       "template": "Results: {{node_1}}"
     }
   }
   ```

5. **Aggregation Node**: Combine data
   ```javascript
   {
     "type": "aggregation",
     "config": {
       "strategy": "merge"
     }
   }
   ```

### Result Passing

Nodes can access results from their predecessors:

```javascript
// Node B receives data from Node A
{
  "context": {
    "results": {
      "node_a_id": [{ "userId": 1, "name": "John" }]
    },
    "predecessorResults": {
      "node_a_id": [...]
    }
  }
}
```

### DAG Structure

Workflows are represented as Directed Acyclic Graphs:

- **Nodes**: Tasks to execute
- **Edges**: Dependencies between nodes
- **No Cycles**: Prevents infinite loops
- **Parallel Execution**: Independent nodes run simultaneously

---

## 🎨 Design Patterns

### 1. Factory Pattern
**NodeFactory** creates and manages different node types.

```javascript
const node = NodeFactory.createNode('http_request', config);
```

### 2. Observer Pattern
Workers observe Redis queue for new tasks.

### 3. Strategy Pattern
Different execution strategies for node types.

### 4. Repository Pattern
Data access through Mongoose models.

### 5. Middleware Pattern
Express middleware for auth, validation, error handling.

### 6. Builder Pattern
Workflow construction through incremental node/edge addition.

---

## 📖 Usage Examples

### Example 1: Simple HTTP API Workflow

```javascript
// 1. Create workflow
POST /workflows
{
  "name": "Fetch and Process Users"
}

// 2. Add HTTP Request Node
POST /workflows/:id/nodes
{
  "type": "http_request",
  "label": "Fetch Users",
  "config": {
    "url": "https://jsonplaceholder.typicode.com/users",
    "method": "GET"
  }
}
// Returns: { node: { id: "node_1" } }

// 3. Add Transform Node
POST /workflows/:id/nodes
{
  "type": "data_transform",
  "label": "Extract Names",
  "config": {
    "operation": "map",
    "expression": "item.name"
  }
}
// Returns: { node: { id: "node_2" } }

// 4. Connect nodes
POST /workflows/:id/edges
{
  "from": "node_1",
  "to": "node_2"
}

// 5. Publish
PUT /workflows/:id/publish

// 6. Execute
POST /workflows/:id/trigger

// 7. Monitor
GET /runs/:runId/logs
```

### Example 2: Conditional Workflow

```javascript
// Workflow: Fetch data → Check status → Send email if successful

// Node 1: HTTP Request
// Node 2: Conditional (check if status === 200)
// Node 3: Email (send success email)
// Node 4: Email (send failure email)

// Edges:
// Node 1 → Node 2 (main)
// Node 2 → Node 3 (if true)
// Node 2 → Node 4 (if false)
```

---

## 🔧 Development

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

### Debugging

Enable debug logs:
```bash
DEBUG=workflow:* npm run dev
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Cast to ObjectId failed for value 'undefined'"
**Solution**: Ensure you're passing valid IDs from frontend
```javascript
// ❌ Wrong
const runId = undefined;
fetch(`/api/runs/${runId}/logs`);

// ✅ Correct
if (!runId || runId === 'undefined') return;
fetch(`/api/runs/${runId}/logs`);
```

#### 2. MongoDB Connection Failed
**Solution**: Check MongoDB is running and connection string is correct
```bash
# Check MongoDB status
docker ps | grep mongo

# Check connection
mongo mongodb://localhost:27017
```

#### 3. Redis Connection Failed
**Solution**: Verify Redis is running
```bash
# Check Redis
redis-cli ping
# Should return: PONG
```

#### 4. Worker Not Processing Jobs
**Solution**: Ensure worker process is running
```bash
npm run worker
```

---

## 📊 Performance Optimization

### Scaling Workers

Run multiple worker instances:
```bash
# Terminal 1
npm run worker

# Terminal 2
npm run worker

# Terminal 3
npm run worker
```

### Database Indexing

Add indexes for better query performance:
```javascript
// In Workflow model
workflowSchema.index({ userId: 1, status: 1 });
workflowSchema.index({ 'definition.nodes.id': 1 });
```

### Redis Configuration

Optimize Redis for high throughput:
```redis
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

---

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit `.env` files
2. **JWT Secrets**: Use strong, random secrets in production
3. **Webhook Secrets**: Rotate secrets periodically
4. **Input Validation**: All inputs are validated
5. **Rate Limiting**: Implement rate limiting in production
6. **HTTPS**: Always use HTTPS in production
7. **Database**: Use MongoDB authentication in production

---

## 📈 Monitoring & Logging

### Application Logs

```bash
# View logs
tail -f logs/application.log

# View worker logs
tail -f logs/worker.log
```

### Health Check

```bash
curl http://localhost:3000/health
```

### Metrics

Monitor these metrics:
- Queue size
- Worker CPU/Memory usage
- MongoDB connections
- Redis memory usage
- API response times

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by [n8n](https://n8n.io/)
- Built with [BullMQ](https://docs.bullmq.io/)
- Uses [Mongoose ODM](https://mongoosejs.com/)

---

## 📞 Support

- **Documentation**: [Full Docs](https://docs.yourapp.com)
- **Issues**: [GitHub Issues](https://github.com/yourusername/workflow-automation/issues)
- **Discord**: [Join Community](https://discord.gg/yourserver)
- **Email**: support@yourapp.com

---

## 🗺️ Roadmap

- [ ] Visual workflow editor UI
- [ ] More node types (Database, File operations)
- [ ] Workflow versioning
- [ ] Workflow templates marketplace
- [ ] Real-time collaboration
- [ ] Advanced monitoring dashboard
- [ ] Workflow debugging tools
- [ ] Multi-tenancy improvements
- [ ] Cloud deployment guides

---

**Made with ❤️ by Aditya Deshmukh**
