# Election Management System Implementation TODO
Status: Active | Aligned to Mermaid diagram + tech_stack.md + SYSTEM_ARCHITECTURE.md

## Legend
- [ ] TODO
- [x] DONE
- [>] In Progress

## Priority 1: Backend & Streaming
- [ ] Update docker-compose.yml: Add Postgres, MongoDB, Redis, Kafka, Mosquitto (mTLS)
- [ ] Backend: Install deps (kafkajs, socket.io, ioredis, sequelize/pg, mongoose, fabric-network, mqtt)
- [ ] backend/src/db/: Create Sequelize Postgres models (VoterRegistry), Mongoose MongoDB (AuditLogs)
- [ ] backend/src/services/: voteService, fabricService, iotService, kafkaProducer (election-telemetry topic)
- [ ] backend/src/: Add WebSocket server (real-time dashboards)
- [ ] backend/src/server.js: Integrate all (ports 3000, MQTT listener)

## Priority 2: Blockchain Layer
- [ ] blockchain/network/: Setup 3-org (EC/Judiciary/Observers), crypto-config.yaml, endorsement AND('Org1.peer','Org2.peer')
- [ ] chaincode/voting/voting.go: CastVote(zkp,encrypted), GetResults, VerifyReceipt
- [ ] scripts/deployChaincode.sh: Deploy to network

## Priority 3: ML Fraud Detection
- [ ] ml-service/requirements.txt: scikit-learn, xgboost, tensorflow, kafka-python
- [ ] ml-service/src/models/ensemble.py: Isolation Forest + XGBoost + LSTM → score >0.6
- [ ] kafka_consumer.py: Consume election-telemetry → fraud_detector.py → alert_service.py (Webhook backend)

## Priority 4: IoT Edge
- [ ] iot-terminal/firmware/: Update BiometricHandler.cpp (R307), NetworkManager.cpp (MQTT mTLS)
- [ ] iot-terminal/src/mqtt_client.py: mTLS to Mosquitto

## Priority 5: Unified Frontend (ElectionOS)
- [ ] frontend/src/App.jsx: Router to Admin/Voter/Observer/Verification portals
- [ ] Portals: Voter (7-steps, ZKP QR), Observer (WebSocket charts), etc.

## Priority 6: Infra & Compliance
- [ ] infrastructure/monitoring/: Prometheus/Grafana dashboards
- [ ] DPDP hooks in auth, Ethereum snapshot script

## Testing/Validation
- [ ] docker-compose up → Test full stack
- [ ] scripts/simulation/simulate-election.py
- [ ] tests/load/ Artillery tests
- [ ] scripts/chaos-monkey-drill.sh

Next Step: Backend docker-compose + DBs + Kafka
Updated: After each completion
