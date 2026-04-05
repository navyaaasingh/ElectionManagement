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
```bash
cd ml-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python api.py
```
**Service URL:** `http://localhost:5000`

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

## PART 6 — Quick Reference: Ports & Health

| Component | Port | Health Check URL |
| :--- | :--- | :--- |
| **Backend API** | 3000 | `http://localhost:3000/health` |
| **Frontend** | 3001 | `http://localhost:3001` |
| **ML Service** | 5000 | `http://localhost:5000/status` |
| **PostgreSQL** | 5432 | — |
| **Prometheus** | 9090 | `http://localhost:9090` |
| **Grafana** | 3004 | `http://localhost:3004` |

---

## Common Dev Scenarios

### Stop All Services
```bash
# Stop infra and dev servers
docker compose down
# Kill local node/python processes with Ctrl+C
```

### Full Clean Reset (Dev Only)
```bash
# WARNING: This deletes all database and blockchain data!
docker compose down -v
npm run fabric:stop
```

---
*Created by Antigravity — Election Management Team*
