/**
 * IoT Terminal Service
 * Handles communication with IoT voting terminals (ESP32)
 */

const mqtt = require('mqtt');
const logger = require('../utils/logger');
const EventEmitter = require('events');
const { publishPartitionedIoTBroadcast } = require('./kafkaProducer.js');
const { Voter, Election, Candidate } = require('../models/index.js');

class IoTService extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.terminals = new Map(); // terminalId -> status
        this.connected = false;
    }

    /**
     * Initialize MQTT connection
     */
    async initialize() {
        try {
            const mqttUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

            this.client = mqtt.connect(mqttUrl, {
                clientId: `backend-${Date.now()}`,
                clean: true,
                connectTimeout: 4000,
                username: process.env.MQTT_USERNAME,
                password: process.env.MQTT_PASSWORD,
                reconnectPeriod: 1000
            });

            this.client.on('connect', () => {
                console.log('Connected to MQTT broker');
                this.connected = true;

                // Subscribe to terminal topics
                this.client.subscribe('election/terminal/+/status', { qos: 1 });
                this.client.subscribe('election/terminal/+/tamper', { qos: 1 });
                this.client.subscribe('election/vote/submit', { qos: 2 });
                this.client.subscribe('election/auth/request', { qos: 1 });

                logger.auditLog({
                    event_type: 'MQTT_CONNECTED',
                    metadata: {
                        broker: mqttUrl
                    }
                });
            });

            this.client.on('message', (topic, message) => {
                this.handleMessage(topic, message);
            });

            this.client.on('error', (error) => {
                logger.error('MQTT error:', error);
            });

            this.client.on('close', () => {
                this.connected = false;
                logger.warn('MQTT connection closed');
            });

        } catch (error) {
            logger.error('Failed to initialize IoT service:', error);
            throw error;
        }
    }

    /**
     * Handle incoming MQTT messages
     * @param {String} topic - MQTT topic
     * @param {Buffer} message - Message buffer
     */
    handleMessage(topic, message) {
        try {
            const payload = JSON.parse(message.toString());
            const parts = topic.split('/');

            if (parts[0] === 'election' && parts[1] === 'auth' && parts[2] === 'request') {
                return this.handleAuthRequest(payload);
            }

            if (parts[0] === 'election' && parts[1] === 'vote' && parts[2] === 'submit') {
                const terminalId = payload.terminal_id || payload.terminalId;
                return this.handleVoteSubmission(terminalId, payload);
            }

            if (parts[0] === 'election' && parts[1] === 'terminal') {
                const terminalId = parts[2];
                const messageType = parts[3];

                switch (messageType) {
                    case 'status':
                        return this.handleStatusUpdate(terminalId, payload);
                    case 'tamper':
                        return this.handleAlert(terminalId, payload);
                    case 'health':
                        return this.handleHealthUpdate(terminalId, payload);
                    default:
                        logger.warn(`Unknown terminal message type: ${messageType}`);
                        return;
                }
            }

        } catch (error) {
            logger.error('Error handling MQTT message:', error);
        }
    }

    /**
     * Handle biometric authentication request from terminal
     */
    async handleAuthRequest(payload) {
        try {
            const terminalId = payload.terminalId || payload.terminal_id;
            const biometricHash = payload.biometricHash || payload.biometric_hash;

            if (!terminalId || !biometricHash) {
                this.sendAuthResponse(terminalId || 'UNKNOWN', {
                    status: 'failed',
                    error: 'Missing terminalId or biometricHash',
                    timestamp: Date.now(),
                });
                return;
            }

            if (!/^[a-f0-9]{64}$/i.test(String(biometricHash))) {
                this.sendAuthResponse(terminalId, {
                    status: 'failed',
                    error: 'Invalid biometric hash format',
                    timestamp: Date.now(),
                });
                return;
            }

            const voter = await Voter.findOne({
                where: {
                    biometric_hash: biometricHash,
                    status: 'active',
                },
            });

            if (!voter) {
                this.sendAuthResponse(terminalId, {
                    status: 'failed',
                    error: 'Biometric not recognized',
                    timestamp: Date.now(),
                });
                return;
            }

            if (voter.has_voted) {
                this.sendAuthResponse(terminalId, {
                    status: 'failed',
                    error: 'Voter has already voted',
                    voterId: voter.voter_id,
                    timestamp: Date.now(),
                });
                return;
            }

            const activeElection = await Election.findOne({
                where: { status: 'ACTIVE' },
                order: [['start_date', 'ASC']],
            });

            if (!activeElection) {
                this.sendAuthResponse(terminalId, {
                    status: 'failed',
                    error: 'No active election',
                    voterId: voter.voter_id,
                    timestamp: Date.now(),
                });
                return;
            }

            let candidates = await Candidate.findAll({
                where: {
                    election_id: activeElection.election_id,
                    district_id: voter.district_id,
                    status: 'active',
                },
                attributes: ['candidate_id'],
                order: [['createdAt', 'ASC']],
            });

            // Fallback to election-wide active candidates if district-scoped
            // list is empty.
            if (!candidates || candidates.length === 0) {
                candidates = await Candidate.findAll({
                    where: {
                        election_id: activeElection.election_id,
                        status: 'active',
                    },
                    attributes: ['candidate_id'],
                    order: [['createdAt', 'ASC']],
                });
            }

            if (!candidates || candidates.length === 0) {
                this.sendAuthResponse(terminalId, {
                    status: 'failed',
                    error: 'No active candidates configured for election',
                    voterId: voter.voter_id,
                    electionId: activeElection.election_id,
                    timestamp: Date.now(),
                });
                return;
            }

            const candidateIds = candidates
                .map((candidate) => candidate.candidate_id)
                .filter(Boolean);

            this.sendAuthResponse(terminalId, {
                status: 'success',
                voterId: voter.voter_id,
                electionId: activeElection.election_id,
                districtId: voter.district_id,
                candidateIds,
                terminalId,
                timestamp: Date.now(),
            });

            await logger.auditLog({
                event_type: 'IOT_AUTH_SUCCESS',
                user_id: voter.voter_id,
                metadata: {
                    terminal_id: terminalId,
                    election_id: activeElection.election_id,
                },
            });
        } catch (error) {
            logger.error('Error handling biometric auth request:', error);

            const terminalId = payload?.terminalId || payload?.terminal_id || 'UNKNOWN';
            this.sendAuthResponse(terminalId, {
                status: 'failed',
                error: 'Internal authentication error',
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle terminal status update
     */
    handleStatusUpdate(terminalId, payload) {
        this.terminals.set(terminalId, {
            ...payload,
            lastSeen: new Date()
        });

        this.emit('status', { terminalId, status: payload });

        logger.auditLog({
            event_type: 'TERMINAL_STATUS_UPDATE',
            metadata: {
                terminal_id: terminalId,
                status: payload.status
            }
        });
    }

    /**
     * Handle terminal health metrics
     */
    handleHealthUpdate(terminalId, payload) {
        const health = {
            terminalId,
            ...payload,
            timestamp: new Date()
        };

        this.emit('health', health);

        // Check for concerning metrics
        if (payload.battery < 20) {
            this.emit('alert', {
                terminalId,
                type: 'LOW_BATTERY',
                severity: 'MEDIUM',
                value: payload.battery
            });
        }

        if (payload.temperature > 70) {
            this.emit('alert', {
                terminalId,
                type: 'HIGH_TEMPERATURE',
                severity: 'HIGH',
                value: payload.temperature
            });
        }
    }

    /**
     * Handle vote submission from terminal
     */
    async handleVoteSubmission(terminalId, payload) {
        try {
            // Vote data should be relayed to vote service
            const voteService = require('./voteService');

            const result = await voteService.castVote({
                ...payload,
                terminalId
            });

            // Send confirmation back to terminal
            this.sendConfirmation(terminalId, {
                voteId: result.voteId,
                status: 'SUCCESS',
                receipt: result.receipt
            });

        } catch (error) {
            logger.error('Error processing terminal vote:', error);

            // Send error back to terminal
            this.sendConfirmation(terminalId, {
                status: 'FAILED',
                error: error.message
            });
        }
    }

    /**
     * Handle alert from terminal (e.g., tamper detection)
     */
    async handleAlert(terminalId, payload) {
        await logger.auditLog({
            event_type: 'TERMINAL_ALERT',
            severity: payload.severity || 'HIGH',
            metadata: {
                terminal_id: terminalId,
                alert_type: payload.type,
                ...payload
            }
        });

        // Emit alert for real-time notification
        this.emit('alert', {
            terminalId,
            ...payload
        });

        // If tamper alert, disable terminal
        if (payload.type === 'TAMPER_DETECTED') {
            await this.disableTerminal(terminalId, 'Tamper detected');
        }
    }

    /**
     * Broadcast activation signal to all terminals
     * @param {String} electionId - Election ID
     */
    async broadcastActivation(electionId) {
        const message = {
            command: 'ACTIVATE',
            electionId,
            timestamp: Date.now()
        };

        this.client.publish('election/command', JSON.stringify(message));
        await publishPartitionedIoTBroadcast({
            electionId,
            messageType: 'IOT_ACTIVATE',
            data: message,
        });

        await logger.auditLog({
            event_type: 'TERMINALS_ACTIVATED',
            severity: 'CRITICAL',
            metadata: {
                election_id: electionId
            }
        });
    }

    /**
     * Broadcast deactivation signal to all terminals
     * @param {String} electionId - Election ID
     */
    async broadcastDeactivation(electionId) {
        const message = {
            command: 'DEACTIVATE',
            electionId,
            timestamp: Date.now()
        };

        this.client.publish('election/command', JSON.stringify(message));
        await publishPartitionedIoTBroadcast({
            electionId,
            messageType: 'IOT_DEACTIVATE',
            data: message,
        });

        await logger.auditLog({
            event_type: 'TERMINALS_DEACTIVATED',
            severity: 'CRITICAL',
            metadata: {
                election_id: electionId
            }
        });
    }

    /**
     * Send confirmation to specific terminal
     */
    sendConfirmation(terminalId, data) {
        const topic = `election/vote/ack/${terminalId}`;
        this.client.publish(topic, JSON.stringify(data));
    }

    /**
     * Send authentication response to specific terminal
     */
    sendAuthResponse(terminalId, data) {
        const topic = `election/auth/response/${terminalId}`;
        this.client.publish(topic, JSON.stringify(data));
    }

    /**
     * Disable a specific terminal
     * @param {String} terminalId - Terminal ID
     * @param {String} reason - Reason for disabling
     */
    async disableTerminal(terminalId, reason) {
        const message = {
            command: 'DISABLE',
            reason,
            timestamp: Date.now()
        };

        this.client.publish(`election/terminal/${terminalId}/command`, JSON.stringify(message));

        await logger.auditLog({
            event_type: 'TERMINAL_DISABLED',
            severity: 'CRITICAL',
            metadata: {
                terminal_id: terminalId,
                reason
            }
        });
    }

    /**
     * Get all registered terminals
     */
    getTerminals() {
        return Array.from(this.terminals.entries()).map(([id, status]) => ({
            terminalId: id,
            ...status
        }));
    }

    /**
     * Get specific terminal status
     */
    getTerminalStatus(terminalId) {
        return this.terminals.get(terminalId) || null;
    }

    /**
     * Cleanup and close connections
     */
    async shutdown() {
        if (this.client) {
            this.client.end(true);
        }
        this.connected = false;
    }
}

module.exports = new IoTService();
