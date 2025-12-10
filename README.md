# 🚀 Flow: Distributed Workflow Builder Backend

**Flow** is a reliable, extensible backend for a distributed workflow orchestration system (similar to Zapier or n8n). This project implements a core API Gateway and a decoupled Execution Worker using Node.js and BullMQ, satisfying the requirements for a highly available, fault-tolerant system.

## ✨ Features and Requirements Met

| Category | Requirement | Implementation Detail |
| :--- | :--- | :--- |
| **Architecture** | Scalability, Fault Tolerance | API Gateway (Express) is decoupled from the Executor Worker (BullMQ). Automatic retries are configured on the queue. |
| **Workflow State** | Draft / Published | Handled by a status field in the PostgreSQL `Workflow` model. `PUT /publish` enforces the transition. |
| **Triggers** | Webhook Trigger | Implemented via a public POST endpoint that uses a secret key for authentication and queues a new run. |
| **Core Nodes** | HTTP Request, Condition, Delay | Implemented as modular handlers executed by the worker. |
| **Monitoring** | Persistence & Logs Tracking | Node-level input/output/duration logs are appended to the `WorkflowRun` record in PostgreSQL (JSONB). |

## 🛠️ Technology Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Runtime** | Node.js / Express | API Gateway & REST APIs |
| **Database** | PostgreSQL / Sequelize | Persistence for definitions, runs, and logs. (Mocked with SQLite for easy local setup) |
| **Queue** | Redis / BullMQ | Central task broker, scheduling, and delay management. |
| **HTTP Client** | Axios | Used by the `HTTPHandler`. |

## ⚙️ Setup and Installation

### Prerequisites

1.  **Node.js** (v18+)
2.  **PostgreSQL** (Optional, if switching from SQLite mock)
3.  **Redis Server:** Must be running on `localhost:6379`. (Use Docker for the quickest setup: `docker run --name redis-flow -d -p 6379:6379 redis`)

### Running the Services

The system requires two separate terminal windows/processes running concurrently:

1.  **Start API Gateway (Terminal 1):**
    ```bash
    npm start
    ```
2.  **Start Executor Worker (Terminal 2):**
    ```bash
    npm run worker
    ```

## 🧠 Core Architecture and Nodes Explained

### Core Architecture

The system operates on a **Producer-Consumer pattern** to ensure that synchronous API calls are never blocked by long-running workflow executions.

* **API Gateway (Producer):** Receives the **Webhook Trigger**. It creates a `WorkflowRun` record in the DB and queues the *first node* of the workflow into Redis via BullMQ.
* **Executor Worker (Consumer):** Continuously listens to the Redis queue. It executes a single node, records its output to the database, and then queues the *next node* until the workflow ends or fails.