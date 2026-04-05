#!/bin/bash

# Configuration
export PORT=3000
export MONGODB_URI="mongodb://localhost:27017/electionos"
export REDIS_URL="redis://localhost:6379"
export KAFKA_BROKER="localhost:9092"
export ML_SERVICE_API_KEY="ml-internal-secret"
export BACKEND_ALERT_URL="http://localhost:3000/api/v1/audit/alerts"

# Colors for logging
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== ElectionOS Local Services Runner ===${NC}"

# Start Backend
echo -e "${GREEN}Starting Backend API...${NC}"
cd backend && npm run dev &
BACKEND_PID=$!

# Start ML Consumer (Python)
echo -e "${GREEN}Starting ML Fraud Consumer...${NC}"
cd ml-service && python3 kafka_consumer.py &
ML_PID=$!

function cleanup {
    echo -e "\n${BLUE}Shutting down services...${NC}"
    kill $BACKEND_PID
    kill $ML_PID
    exit
}

trap cleanup SIGINT

echo -e "${BLUE}Services are running. Press Ctrl+C to stop.${NC}"
wait
