# Election Management System — Complete Setup & Run Guide

### Execution Architecture: Infrastructure → Blockchain → Backend → ML → Frontend

> Run every command in order for a smooth deployment experience.  
> All commands assume macOS and the terminal app (zsh/bash).

---

## PART 0 — Prerequisites & Tools

Skip any tool you already have installed (check with `--version`).

### 0.1 · Node.js (v20+) & Python (3.11+)
```bash
# Verify Node & NPM
node --version && npm --version

# Verify Python
python3 --version
```

### 0.2 · Docker Desktop (Mandatory)
1. Ensure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is running.
2. Verify: `docker compose version` (must be v2.20+).

### 0.3 · Clone & Initialize Environment
```bash
git clone https://github.com/navyaaasingh/ElectionManagement.git
cd ElectionManagement

# Setup Environment Keys
cp .env.example .env
# Edit .env with your local secrets (JWT_SECRET, post_pw, etc.)
```

---

## PART 1 — Infrastructure (Databases & MQTT)

Start the core services that the system depends on.

```bash
# Start PostgreSQL, MongoDB, Redis, and the MQTT broker
docker compose up -d postgres mongodb redis mqtt-broker

# Verify they are healthy
docker compose ps
```
Wait ~20 seconds for the databases to initialize.

---

## PART 2 — Blockchain Layer (Hyperledger Fabric)

This handles the immutable ledger for vote recording and audit proofs.

```bash
# 2.1 · Start the Fabric Network
npm run fabric:start

# 2.2 · Deploy the Voting Chaincode
npm run fabric:deploy
```
*Note: This creates the peer nodes and the channel required for vote anchoring.*

---

## PART 3 — Backend API (Node.js/Express)

The central orchestration layer for authentication, identity, and business logic.

```bash
# 3.1 · Install Dependencies
cd backend
npm install

# 3.2 · Database Initialization
npm run db:migrate
npm run db:seed  # Optional: Adds dummy candidates and admin users

# 3.3 · Start Development Server
npm run dev
```
**Healthy Output:** `Server running on port 3000` & `Blockchain Gateway Connected`.

---

## PART 4 — Machine Learning & Analytics

The ML service handles real-time fraud detection and behavioral telemetry.

### 4.1 · Startup ML Service
**Option A: Local Environment**
```bash
cd ml-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python api.py
```

**Option B: Google Colab (Recommended for Performance)**
1.  Open [Google Colab](https://colab.research.google.com/).
2.  Upload `api.ipynb` and `fraud_detector.ipynb` from the `/ml-service` directory.
3.  Install dependencies: `!pip install flask flask-cors requests pydantic`.
4.  Run all cells to start the API.
5.  **Important**: Use [ngrok](https://ngrok.com/) or [localtunnel](https://localtunnel.github.io/www/) to expose the Colab local server (usually `http://localhost:5000`) and obtain a public URL.

### 4.2 · Update Backend Configuration
Ensure your `backend/.env` points to the correct ML Service location:
```bash
# If using Colab, replace with your ngrok/localtunnel URL:
PYTHON_ML_SERVICE_URL=https://your-unique-ngrok-url.ngrok-free.app 
```

### 4.2 · Run Traffic Simulation (Optional)
To see the monitoring dashboards "alive" with data:
```bash
# In a new terminal tab
node scripts/simulate_ml_traffic.js
```

---

## PART 5 — Frontend Portals (React/Vite)

Unified UI for Voters, Admins, and Observers.

```bash
cd frontend
npm install
npm run dev
```
**Access the platform:**
*   **Main Landing**: `http://localhost:3001`
*   **Voter Login**: `http://localhost:3001/voter`
*   **Admin Dashboard**: `http://localhost:3001/admin`
*   **Observer Results**: `http://localhost:3001/results`

---

## PART 6 — ML & Fraud Detection Reference

Commands to verify the "Mock Mode" fallback and real-time inference.

### 6.1 · Verify ML Service Mode (Real vs Mock)
Checks if the service is running in **Real** (High-fidelity models) or **Mock** (Heuristic fallback) mode.
```bash
# Check service health and operating mode
curl http://localhost:5000/status
```

### 6.2 · Run System Stability Audit
Runs the `test_segfault.py` utility to ensure the service is stable and handling burst detection correctly.
```bash
cd ml-service
source venv/bin/activate
python test_segfault.py
```

### 6.3 · Real-Time Fraud Alert Inspection
View specifically the high-priority fraud alerts detected by the system.
```bash
# In MongoDB Shell:
use election_logs;
db.audit_logs.find({ "type": "FRAUD_ALERT" }).sort({ "timestamp": -1 }).limit(10).pretty();
```

### 6.4 · Manual Traffic Simulation
Inject synthetic voting patterns to test the UI's real-time monitoring graphs.
```bash
# From the root directory:
node scripts/simulate_ml_traffic.js
```

### 6.5 · Trace Recent Work (AIG Work Audit)
If you need to quickly locate the specific ML fallback and data parity logic we've implemented:
```bash
# Locate "Mock Mode", Data Parity, and Burst Detector logic
grep -rnE "(MOCK_MODE|summarizeElections|burst_detector)" .
```

---

## PART 7 — Quick Reference: Ports & Health

| Component | Port | Health Check URL |
| :--- | :--- | :--- |
| **Backend API** | 3000 | `http://localhost:3000/health` |
| **Frontend** | 3001 | `http://localhost:3001` |
| **ML Service** | 5000 | `http://localhost:5000/status` |
| **PostgreSQL** | 5432 | — |
| **Prometheus** | 9090 | `http://localhost:9090` |
| **Grafana** | 3004 | `http://localhost:3004` |

---

## PART 8 — Database & Infrastructure Access

Use these commands to inspect the live state of the application's databases and event brokers.

### 8.1 · PostgreSQL (Relational Data)
Connect to the core registry to view voters, candidates, and elections.
```bash
# Enter the SQL CLI
docker exec -it election-postgres psql -U election_admin -d election_db

# Useful SQL Queries:
# View all elections:  SELECT * FROM election;
# View candidates:     SELECT * FROM candidate;
# View voting counts:  SELECT election_name, total_votes_cast FROM election;
```

### 8.2 · MongoDB (Audit Logs)
Inspect the immutable audit trail and ML-detected fraud alerts.
```bash
# Enter the MongoDB Shell (mongosh)
docker exec -it election-mongodb mongosh -u mongo_admin -p changeme_mongo_password --authenticationDatabase admin

# Useful Mongo Commands:
# use election_logs;
# db.audit_logs.find().sort({timestamp: -1}).limit(5).pretty();
# db.audit_logs.countDocuments();
```

### 8.3 · Redis (Cache & Session)
Monitor real-time caching and session tokens.
```bash
# Enter Redis CLI
docker exec -it election-redis redis-cli -a changeme_redis_password

# Useful Redis Commands:
# KEYS *          (List all keys)
# GET key_name    (View value)
# FLUSHALL        (Wipe cache - use with caution!)
```

### 8.4 · Kafka (Event Streaming)
Monitor the background telemetry stream consumed by the ML service.
```bash
# List all active topics
docker exec -it election-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

# Tail the real-time telemetry stream
docker exec -it election-kafka kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic election-telemetry --from-beginning
```

---

## PART 9 — Developer Utilities & Troubleshooting

### Log Monitoring
Tail logs for specific services to debug connectivity or logic errors.
```bash
# Backend Logs
docker logs -f election-backend

# ML Service Logs
docker logs -f election-ml-analytics

# Blockchain Peer Logs
docker logs -f peer0.electioncommission.election.com
```

### Identity & Port Management
If services fail to start due to port conflicts:
```bash
# Find what is using port 3000 (Backend)
lsof -i :3000

# Kill process on port 3000
kill -9 $(lsof -t -i:3000)
```

### State Resets
```bash
# Stop infra and dev servers
docker compose down

# Wipe all database volumes and start fresh (Dev Only)
docker compose down -v
npm run db:migrate && npm run db:seed

# Force-clear Frontend build cache (if UI gets stuck)
rm -rf frontend/node_modules/.vite
```

---
*Created by Antigravity — Election Management Team*
