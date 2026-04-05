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

const initKafkaProducer = async () => {
    try {
        await producer.connect();
        isConnected = true;
        logger.info('Kafka producer connected successfully');
    } catch (error) {
        logger.error('Failed to connect Kafka producer', { error: error.message });
        // Don't kill the app if Kafka is down, just log it. Retries handle reconnection.
    }
};

const publishTelemetry = async (topic, messageType, data) => {
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
                    value: JSON.stringify({
                        type: messageType,
                        timestamp: new Date().toISOString(),
                        data
                    })
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
