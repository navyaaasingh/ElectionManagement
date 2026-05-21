# 🗳️ ElectionOS: Secure & Transparent Digital Election Ecosystem

A **blockchain-hardened, IoT-enabled ecosystem** designed for **high-trust institutional elections**. ElectionOS integrates **Zero-Knowledge Proofs (ZKP)**, **Biometric Authentication**, and **DPDP Act-compliant Data Privacy flows** into a unified digital framework.

> **Status:** 🏁 **Enterprise Phase Complete** — Unified "ElectionOS" Shell Deployment & ZKP-Hardened Audit Trails

---

## 📚 Documentation Index

### Getting Started
- **[Quick Setup Guide](SETUP.md)** — Development environment setup
- **[Deployment Guide](docs/deployment/DEPLOYMENT_GUIDE.md)** — Production deployment (Kubernetes)
- **[PRD](PRD.md)** — Product Requirements Document

### Architecture & Design
- **[System Architecture](docs/architecture/LIFECYCLE_AND_ROLES.md)** — Component lifecycle & roles
- **[Data Model](docs/architecture/DATA_MODEL.md)** — Database schema & relationships
- **[API Contracts](docs/architecture/API_CONTRACTS.md)** — Complete API specification
- **[Blockchain Schema](docs/architecture/BLOCKCHAIN_SCHEMA.md)** — Ledger structure
- **[Fabric Topology](docs/blockchain/FABRIC_TOPOLOGY.md)** — Network configuration

### Component Specifications
- **[Backend Services](docs/backend/SERVICE_DESIGN.md)** — Service architecture
- **[IoT Firmware](docs/iot/FIRMWARE_SPEC.md)** — ESP32 firmware & security
- **[Voter UX](docs/frontend/UX_SPEC.md)** — 7-step voting flow
- **[ML Fraud Detection](docs/ml/FRAUD_DETECTION_SPEC.md)** — Anomaly detection pipeline

### Security & Operations
- **[Threat Model](docs/security/THREAT_MODEL.md)** — Complete security analysis
- **[Monitoring Plan](docs/operations/MONITORING_PLAN.md)** — Observability strategy
- **[Reliability Plan](docs/testing/RELIABILITY_PLAN.md)** — Testing & DR

### Reference
- **[OpenAPI Spec](docs/api/openapi.yaml)** — Machine-readable API
- **[Tech Stack](tech_stack.md)** — Technologies & libraries

---

## 🚀 Project Motivation

Many electoral systems in developing regions face challenges such as:

* Voter impersonation and multiple voting
* Lack of transparency in vote counting
* Manual processes prone to corruption
* Limited trust from citizens and international observers

This project proposes a **technology-driven election framework** that guarantees:

* **One person, one vote**
* **Tamper-proof vote storage**
* **Real-time verification and auditing**
* **Privacy-preserving voter authentication**

---

## 🧠 Key Features

* ✅ **Biometric-based voter authentication** (SHA-256 fingerprint hashing)
* 🔗 **Blockchain-hardened tallying** with Hyperledger Fabric (permissioned) and Monad (anchoring)
* 🔐 **Zero-Knowledge Proofs (ZKP)** for privacy-preserving vote verification
* 🗳️ **ElectionOS Shell** — A unified frontend consolidating Admin, Voter, Observer, and Verification portals
* ⚖️ **DPDP Act Compliance** — Integrated data privacy consent and legal audit infrastructure
* 🚨 **ML Ensemble Fraud Detection** (Isolation Forest + XGBoost + LSTM)
* 📡 **Kafka & WebSocket** real-time telemetry and push notifications
* 🌐 **Multi-language & Accessibility** support (voice-guided, low-literacy optimized)

---

## 🏗️ System Architecture

```
[ IoT Voting Terminal (ESP32 + R307 Fingerprint) ]
                ↓ (MQTT / mTLS)
         [ Backend API Layer (Node.js + Express) ]
          ↓               ↓               ↓
[ Hyperledger Fabric ] [ Kafka ] [ PostgreSQL / MongoDB ]
                          ↓
          [ ML Ensemble Fraud Detector (Python) ]
                          ↓
              [ WebSocket → Observer Dashboard ]
```

> **See:** [Complete Architecture](docs/architecture/LIFECYCLE_AND_ROLES.md)

---

## 🧩 Module Breakdown

### 1️⃣ Voter Registration & Identity Management
* Fingerprint captured and converted into SHA-256 hash
* **No raw biometric data is stored**
* Voter metadata stored off-chain (PostgreSQL)
* Voting eligibility verified via blockchain

### 2️⃣ IoT Voting Terminal (Edge Layer)
* ESP32 microcontroller with **R307 fingerprint sensor**
* Local biometric hashing, offline vote caching (SPIFFS)
* Secure communication via **MQTT** with tamper detection

> **See:** [IoT Terminal README](iot-terminal/README.md) | [Firmware Spec](docs/iot/FIRMWARE_SPEC.md)

### 3️⃣ Blockchain Voting Ledger
* **Hyperledger Fabric** — 3-org topology (Election Commission, Judiciary, Observers)
* Smart contracts enforce voter eligibility, single vote, and immutable recording

> **See:** [Blockchain README](blockchain/README.md) | [Fabric Topology](docs/blockchain/FABRIC_TOPOLOGY.md)

### 4️⃣ Backend & Data Management
* Node.js + Express API (14 REST endpoints)
* Fabric SDK integration, PostgreSQL + MongoDB
* Kafka telemetry producer, WebSocket push server
* Prometheus `/metrics` endpoint for observability

**Key APIs:** `POST /api/v1/votes/cast` · `POST /api/v1/auth/biometric` · `GET /api/v1/results/:electionId` · `GET /api/v1/audit`

> **See:** [API Contracts](docs/architecture/API_CONTRACTS.md) | [OpenAPI Spec](docs/api/openapi.yaml)

### 5️⃣ ElectionOS (Unified Frontend)
* Consolidated **React + Vite** application for all roles (Admin, Voter, Observer, Auditor)
* Role-based access control (RBAC) with protected routes
* Centralized state management for multi-step candidate and election creation flows
* Integrated **Verification Portal** using Sigma-protocol ZKP proofs

> **See:** [Frontend README](frontend/README.md)

### 6️⃣ ML-Based Fraud Detection (Ensemble)
* **3-model ensemble** — Isolation Forest (40%) + XGBoost (40%) + LSTM (20%)
* Kafka stream consumer for real-time telemetry analysis
* 6 behavioral features extracted per vote
* Configurable threshold (default: 0.6 confidence)

> **See:** [ML Service README](ml-service/README.md) | [Fraud Detection Spec](docs/ml/FRAUD_DETECTION_SPEC.md)

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| IoT | ESP32, R307 Fingerprint | 160 MHz, 520 KB RAM, SPIFFS |
| Backend | Node.js 18+, Express | REST API + WebSocket + Kafka |
| Blockchain | Hyperledger Fabric 2.5 | 3-org, Raft consensus |
| Frontend | React 18, Chart.js | Vite build |
| Databases | PostgreSQL 15, MongoDB 6 | Primary + audit logs |
| Cache | Redis | Session & rate limiting |
| Streaming | Apache Kafka | Vote telemetry pipeline |
| ML | Python 3.11, scikit-learn, XGBoost, TensorFlow | Ensemble fraud detection |
| Monitoring | Prometheus, Grafana | Metrics & dashboards |
| CI/CD | GitHub Actions, OWASP ZAP | Lint, test, DAST scan |
| Orchestration | Kubernetes, Docker Compose | StatefulSets, HPA, Ingress |
| Security | SHA-256, TLS 1.3, AES-256-GCM, Helmet | Transport + at-rest |

> **See:** [Complete Tech Stack](tech_stack.md)

---

## 📂 Project Structure

```
ElectionManagement/
│
├── backend/                   ← Node.js API server (CommonJS-hardened)
├── frontend/                  ← **ElectionOS Unified Shell** (Admin, Voter, Observer, Verify)
│   ├── src/components/       ← Role-specific dashboard & portal components
│   └── src/context/          ← Global state & auth context
│
├── blockchain/                ← Hyperledger Fabric & Monad adapters
├── iot-terminal/              ← ESP32 firmware (C++ / Arduino)
├── ml-service/                ← ML fraud detection ensemble (Python)
├── infrastructure/            ← K8s manifests, Monitoring (Prometheus/Grafana)
├── scripts/                   ← Simulation & setup tools
├── docs/                      ← Comprehensive technical specifications
└── docker-compose.yml         ← Development orchestration
│
├── tests/
│   ├── load/                 ← Artillery load testing (500 VU burst)
│   └── pilot/                ← Mock election runner (1,000 synthetic votes)
│
├── .github/workflows/        ← CI/CD (lint, test, build, ZAP DAST)
├── docker-compose.yml        ← Full stack orchestration
└── docs/                     ← Comprehensive documentation
```

---

## 🔐 Security & Privacy

* **No raw biometric data stored** (only SHA-256 hashes)
* Permissioned blockchain with endorsement policies
* Role-based access control (Commissioner, Officer, Observer)
* TLS 1.3 for all transport encryption
* AES-256-GCM for sensitive payload encryption
* Helmet.js HTTP headers hardening
* OWASP ZAP automated DAST scanning in CI/CD
* `npm audit` dependency vulnerability gates

> **See:** [Complete Threat Model](docs/security/THREAT_MODEL.md)

---

## 📊 Performance Targets

* **1,000 TPS** sustained (votes per second)
* **5,000 TPS** burst capacity (1-minute peak)
* **< 2 minutes** average voting time
* **> 95%** biometric auth success rate
* **< 4 minutes** complete voter flow (7 steps)

---

## 🎯 Current Status

All major implementation phases are complete:

- [x] **Backend Core APIs** — 14 REST endpoints, PostgreSQL + MongoDB models
- [x] **Blockchain Layer** — Hyperledger Fabric chaincode, 3-org network, SDK integration
- [x] **IoT Firmware** — ESP32 + R307 fingerprint, MQTT, offline caching, tamper detection
- [x] **ML Fraud Detection** — 3-model ensemble (Isolation Forest + XGBoost + LSTM), Kafka consumer
- [x] **Event Streaming** — Kafka telemetry pipeline + WebSocket push notifications
- [x] **DevOps** — Kubernetes manifests, Prometheus/Grafana, CI/CD with GitHub Actions
- [x] **Security** — OWASP ZAP DAST, npm audit gates, custom security auditor
- [x] **Load Testing** — Artillery (500 VU burst) + Mock Election pilot (1,000 synthetic votes)
- [x] **Frontend UIs** — Voter interface, Observer dashboard, Admin portal

---

## 📜 Disclaimer

This project is a **research and academic prototype** and is **not intended for direct deployment** in real national elections without comprehensive legal, ethical, and security reviews by qualified authorities.

**Compliance:** Designed for India (ECI guidelines, Aadhaar Act). International deployment requires jurisdiction-specific legal review.

---

## ⭐ If you like this project

Give it a ⭐ and feel free to fork, experiment, and contribute!

---

**Built with a focus on security, transparency, and trust..**
