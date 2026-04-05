# %%
"""
Kafka Consumer for real-time vote telemetry.

This service listens to the 'election-telemetry' Kafka topic, analyzes
each incoming vote using the Isolation Forest ML model, and posts
fraud alerts back to the backend via HTTP webhook.
"""

# %%
import os
import json
import time
import logging
import requests
from datetime import datetime
from collections import deque

# !pip install kafka-python scikit-learn joblib flask flask-cors

# %%
from kafka import KafkaConsumer
from fraud_detector import analyze_vote

# %%
# ── Logging configuration ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [kafka_consumer] %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# %%
# ── Config from environment variables ─────────────────────────────────────────
KAFKA_BROKER      = os.getenv('KAFKA_BROKER', 'kafka:9092')
KAFKA_TOPIC       = os.getenv('KAFKA_TOPIC', 'election-telemetry')
KAFKA_GROUP_ID    = os.getenv('KAFKA_GROUP_ID', 'ml-fraud-detector')
BACKEND_ALERT_URL = os.getenv('BACKEND_ALERT_URL', 'http://backend:3000/api/v1/audit/alerts')
ALERT_THRESHOLD   = float(os.getenv('ANOMALY_THRESHOLD', '0.6'))

# %%
# ── Rolling history window (last 500 votes for feature engineering) ────────────
_vote_history: deque = deque(maxlen=500)


# %%
def post_alert(vote_data: dict, analysis: dict):
    """
    Post fraud alert to the backend REST endpoint.
    The backend then broadcasts it over WebSocket to the dashboards.
    """
    alert_payload = {
        'alertType': 'FRAUD_DETECTED',
        'severity': 'HIGH' if analysis['confidence'] > 0.8 else 'MEDIUM',
        'voteId': vote_data.get('voteId'),
        'voterId': vote_data.get('voterId'),
        'terminalId': vote_data.get('terminalId'),
        'district': vote_data.get('district'),
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
            timeout=5,
            headers={
                'Content-Type': 'application/json',
                'x-ml-api-key': os.getenv('ML_SERVICE_API_KEY', 'ml-internal-secret')
            }
        )
        if resp.status_code in (200, 201):
            logger.info(f"Alert posted successfully for voter {vote_data.get('voterId')}")
        else:
            logger.warning(f"Backend returned {resp.status_code} when posting alert: {resp.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to post alert to backend: {e}")


# %%
def wait_for_kafka(broker: str, retries: int = 15, delay: float = 4.0):
    """Block until Kafka is reachable, with exponential back-off."""
    from kafka.errors import NoBrokersAvailable
    for attempt in range(1, retries + 1):
        try:
            # Attempt a probe connection
            consumer = KafkaConsumer(bootstrap_servers=[broker])
            consumer.close()
            logger.info(f"Kafka reachable at {broker}")
            return
        except NoBrokersAvailable:
            logger.warning(f"Kafka not ready (attempt {attempt}/{retries}). Retrying in {delay}s...")
            time.sleep(delay)
            delay = min(delay * 1.5, 30)
    raise RuntimeError(f"Could not connect to Kafka at {broker} after {retries} attempts.")


# %%
def build_consumer() -> KafkaConsumer:
    return KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=[KAFKA_BROKER],
        group_id=KAFKA_GROUP_ID,
        auto_offset_reset='latest',
        enable_auto_commit=True,
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        max_poll_interval_ms=300_000,
    )


# %%
def process_message(message_value: dict):
    """Process a single Kafka message payload."""
    msg_type = message_value.get('type')
    data      = message_value.get('data', {})

    if msg_type != 'VOTE_CAST':
        logger.debug(f"Ignoring message type: {msg_type}")
        return

    logger.info(f"Analyzing vote: voter={data.get('voterId')} terminal={data.get('terminalId')}")

    # Run fraud detection against the rolling history window
    history  = list(_vote_history)
    analysis = analyze_vote(data, history)

    # Always append the vote to history (after analysis to avoid self-reference)
    _vote_history.append(data)

    is_fraudulent = analysis.get('isFraudulent', False)
    confidence    = analysis.get('confidence', 0.0)

    logger.info(
        f"Analysis result: fraudulent={is_fraudulent} "
        f"confidence={confidence:.2f} reason='{analysis.get('reason')}'"
    )

    if is_fraudulent and confidence >= ALERT_THRESHOLD:
        logger.warning(
            f"FRAUD ALERT — voter={data.get('voterId')} "
            f"terminal={data.get('terminalId')} "
            f"confidence={confidence:.2f}"
        )
        post_alert(data, analysis)


# %%
def run():
    """Main consumer loop."""
    logger.info("=== Election ML Kafka Consumer starting ===")
    logger.info(f"Broker: {KAFKA_BROKER} | Topic: {KAFKA_TOPIC} | Group: {KAFKA_GROUP_ID}")
    logger.info(f"Alert threshold: {ALERT_THRESHOLD} | Backend: {BACKEND_ALERT_URL}")

    wait_for_kafka(KAFKA_BROKER)
    consumer = build_consumer()
    logger.info(f"Subscribed to topic '{KAFKA_TOPIC}'. Waiting for messages...")

    try:
        for message in consumer:
            try:
                process_message(message.value)
            except Exception as err:
                logger.error(f"Error processing message offset={message.offset}: {err}", exc_info=True)
    except KeyboardInterrupt:
        logger.info("Shutting down consumer (KeyboardInterrupt)")
    finally:
        consumer.close()
        logger.info("Kafka consumer closed.")


# %%
if __name__ == '__main__':
    run()
