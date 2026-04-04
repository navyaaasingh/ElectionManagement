const { Kafka } = require('kafkajs');
const logger = require('../utils/logger.js');

const kafka = new Kafka({
    clientId: 'election-backend',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    retry: {
        initialRetryTime: process.env.NODE_ENV === 'development' ? 50 : 100,
        retries: process.env.NODE_ENV === 'development' ? 2 : 8
    }
});

const producer = kafka.producer();
let isConnected = false;
let isMockMode = false;

const initKafkaProducer = async () => {
    try {
        // Fast fail for local dev if Kafka isn't explicitly required
        await producer.connect();
        isConnected = true;
        isMockMode = false;
        logger.info('Kafka producer connected successfully');
    } catch (error) {
        isConnected = false;
        isMockMode = true;
        logger.warn('⚠️  Kafka connection failed. Falling back to MOCK MODE for telemetry.');
        logger.warn('ECONNREFUSED for Kafka is expected in a local environment without a running broker.');
    }
};

const publishTelemetry = async (topic, messageType, data) => {
    const payload = {
        type: messageType,
        timestamp: new Date().toISOString(),
        data
    };

    if (isMockMode) {
        // Log to application log instead of dropping if in mock mode
        logger.info(`[MOCK_KAFKA] Topic: ${topic}`, payload);
        return true; 
    }

    if (!isConnected) {
        logger.warn('Kafka producer not connected. Dropping message.', { topic, messageType });
        return false;
    }
    
    try {
        await producer.send({
            topic,
            messages: [
                {
                    key: data.voterId || data.terminalId || 'system',
                    value: JSON.stringify(payload)
                }
            ]
        });
        return true;
    } catch (error) {
        logger.error('Error publishing to Kafka', { topic, error: error.message });
        return false;
    }
};

const disconnectKafkaProducer = async () => {
    if (isConnected) {
        await producer.disconnect();
        isConnected = false;
        logger.info('Kafka producer disconnected');
    }
};

module.exports = {
    initKafkaProducer,
    publishTelemetry,
    disconnectKafkaProducer
};
