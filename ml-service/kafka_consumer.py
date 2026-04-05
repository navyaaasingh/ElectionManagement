import os
import json
import time
import logging
import requests
from datetime import datetime
from collections import deque
from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable
from fraud_detector import analyze_vote

# ── Logging configuration ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] ML_CONSUMER: %(message)s'
)
logger = logging.getLogger(__name__)

# ── Config from environment variables ─────────────────────────────────────────
KAFKA_BROKER      = os.getenv('KAFKA_BROKER', 'kafka:9092')
KAFKA_TOPIC       = os.getenv('KAFKA_TOPIC', 'election-telemetry')
KAFKA_GROUP_ID    = os.getenv('KAFKA_GROUP_ID', 'ml-fraud-detector')
BACKEND_ALERT_URL = os.getenv('BACKEND_ALERT_URL', 'http://backend:3000/api/v1/audit/alerts')
ALERT_THRESHOLD   = float(os.getenv('ANOMALY_THRESHOLD', '0.6'))
API_KEY           = os.getenv('ML_SERVICE_API_KEY', 'ml-internal-secret')

# ── Rolling history window ───────────────────────────────────────────────────
_vote_history: deque = deque(maxlen=1000)

def post_alert(vote_data: dict, analysis: dict):
    """Post fraud alert to the backend REST endpoint."""
    alert_payload = {
        'alertType': 'FRAUD_DETECTED',
        'severity': 'CRITICAL' if analysis['confidence'] > 0.9 else ('HIGH' if analysis['confidence'] > 0.75 else 'MEDIUM'),
        'voteId': vote_data.get('voteId'),
        'voterId': vote_data.get('voterId'),
        'terminalId': vote_data.get('terminalId'),
        'district': vote_data.get('districtId') or vote_data.get('district'),
        'electionId': vote_data.get('electionId'),
        'reason': analysis.get('reason'),
        'confidence': analysis.get('confidence'),
        'anomalyScore': analysis.get('anomalyScore'),
        'detectedAt': datetime.now().isoformat(),
    }

    try:
        resp = requests.post(
            BACKEND_ALERT_URL,
            json=alert_payload,
            timeout=10,
            headers={
                'Content-Type': 'application/json',
                'x-ml-api-key': API_KEY
            }
        )
        if resp.status_code in (200, 201):
            logger.info(f"✅ Alert successfully pushed to backend for voter {vote_data.get('voterId')}")
        else:
            logger.error(f"❌ Backend rejected alert ({resp.status_code}): {resp.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Network error posting alert: {e}")

def wait_for_kafka(broker: str, retries: int = 20, delay: float = 5.0):
    """Block until Kafka is reachable."""
    for attempt in range(1, retries + 1):
        try:
            consumer = KafkaConsumer(bootstrap_servers=[broker], request_timeout_ms=5000)
            consumer.close()
            logger.info(f"✅ Kafka broker detected at {broker}")
            return
        except NoBrokersAvailable:
            logger.warning(f"⏳ Kafka (at {broker}) unavailable. Attempt {attempt}/{retries}. Retrying in {delay}s...")
            time.sleep(delay)
    raise RuntimeError(f"Fatal: Could not reach Kafka at {broker}")

def process_message(message_value: dict):
    """Process a single Kafka message payload."""
    msg_type = message_value.get('type')
    data      = message_value.get('data', {})

    if msg_type != 'VOTE_CAST':
        return

    # 1. Feature Engineering: Compare against recent history
    history  = list(_vote_history)
    analysis = analyze_vote(data, history)

    # 2. Update sliding history window
    _vote_history.append(data)

    is_fraudulent = analysis.get('isFraudulent', False)
    confidence    = analysis.get('confidence', 0.0)

    if is_fraudulent and confidence >= ALERT_THRESHOLD:
        logger.warning(f"🚨 FRAUD DETECTED | Voter: {data.get('voterId')} | Conf: {confidence:.2f} | Reason: {analysis.get('reason')}")
        post_alert(data, analysis)
    else:
        logger.info(f"🟢 Vote Verified: {data.get('voterId')} (Conf: {1-confidence:.2f})")

def run():
    """Main consumer loop."""
    logger.info("Starting ElectionOS ML Consumer Service...")
    
    try:
        wait_for_kafka(KAFKA_BROKER)
        
        consumer = KafkaConsumer(
            KAFKA_TOPIC,
            bootstrap_servers=[KAFKA_BROKER],
            group_id=KAFKA_GROUP_ID,
            auto_offset_reset='latest',
            enable_auto_commit=True,
            value_deserializer=lambda m: json.loads(m.decode('utf-8'))
        )
        
        logger.info(f"Subscribed to topic '{KAFKA_TOPIC}'. Monitoring stream...")
        
        for message in consumer:
            try:
                process_message(message.value)
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                
    except KeyboardInterrupt:
        logger.info("Exiting gracefully...")
    except Exception as e:
        logger.error(f"Fatal error in consumer: {e}")

if __name__ == '__main__':
    run()

