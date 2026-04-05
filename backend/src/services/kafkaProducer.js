const { Kafka, logLevel } = require('kafkajs');
const logger = require('../utils/logger.js');

const kafka = new Kafka({
    clientId: 'election-backend',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    logLevel: logLevel.ERROR,
    retry: {
        initialRetryTime: 100,
        retries: 5
    }
});

const producer = kafka.producer();
let isConnected = false;
let isMockMode = false;

const initKafkaProducer = async () => {
    try {
        await producer.connect();
        isConnected = true;
        isMockMode = false;
        logger.info('✅ Kafka Producer connected successfully');
    } catch (error) {
        isConnected = false;
        isMockMode = true;
        logger.warn('⚠️  Kafka Connection Failed: Falling back to MOCK MODE for telemetry.');
        logger.debug(`Kafka Connection Error: ${error.message}`);
    }
};

/**
 * Publish vote telemetry to Kafka for real-time ML analysis
 * @param {string} topic - Kafka topic (e.g., 'election-telemetry')
 * @param {string} messageType - Event type (e.g., 'VOTE_CAST')
 * @param {Object} data - Payload containing voterId, terminalId, etc.
 */
const publishTelemetry = async (topic, messageType, data) => {
    const payload = {
        type:      messageType,
        timestamp: data.timestamp || new Date().toISOString(),
        metadata: {
            source: 'backend-api',
            version: '1.0.0'
        },
        data: {
            voteId:     data.voteId,
            voterId:    data.voterId,
            electionId: data.electionId,
            candidateId: data.candidateId,
            terminalId: data.terminalId,
            districtId: data.districtId || data.district,
            timestamp:  data.timestamp || new Date().toISOString()
        }
    };

    if (isMockMode) {
        logger.info(`[MOCK_KAFKA] Topic: ${topic} | Type: ${messageType}`, { 
            voterId: data.voterId, 
            terminalId: data.terminalId 
        });
        return true; 
    }

    if (!isConnected) {
        logger.error('CRITICAL: Kafka infrastructure requested but producer not connected.');
        return false;
    }
    
    try {
        await producer.send({
            topic,
            messages: [
                {
                    key:   String(data.voterId || 'system'),
                    value: JSON.stringify(payload)
                }
            ]
        });
        return true;
    } catch (error) {
        logger.error('Error publishing to Kafka broker:', { topic, error: error.message });
        return false;
    }
};

const disconnectKafkaProducer = async () => {
    if (isConnected) {
        await producer.disconnect();
        isConnected = false;
        logger.info('Kafka Producer disconnected');
    }
};

module.exports = {
    initKafkaProducer,
    publishTelemetry,
    disconnectKafkaProducer,
    getKafkaStatus: () => ({ isConnected, isMockMode })
};

