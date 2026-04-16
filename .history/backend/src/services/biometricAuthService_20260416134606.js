/**
 * Biometric Authentication Service
 * Handles biometric hash-based authentication for voters
 */

const Voter = require('../models/Voter');
const VotingRecord = require('../models/VotingRecord');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

class BiometricAuthService {
    /**
     * Authenticate voter using biometric hash
     * @param {String} biometricHash - SHA-256 hash of fingerprint
     * @param {String} terminalId - ID of terminal
     * @returns {Promise<Object>} Authentication result with JWT token
     */
    async authenticate(biometricHash, terminalId) {
        try {
            // 1. Validate biometric hash format
            if (!this.isValidHash(biometricHash)) {
                throw new Error('Invalid biometric hash format');
            }

            // 2. Find voter by biometric hash
            const voter = await Voter.findOne({
                where: { biometric_hash: biometricHash }
            });

            if (!voter) {
                // Log failed attempt
                await logger.auditLog({
                    event_type: 'AUTH_FAILED',
                    severity: 'MEDIUM',
                    metadata: {
                        reason: 'No matching biometric',
                        terminal_id: terminalId,
                        hash_prefix: biometricHash.substring(0, 8) // Only log prefix for privacy
                    }
                });

                return {
                    success: false,
                    error: 'Biometric not recognized'
                };
            }

            // 3. Check voter status
            if (voter.status !== 'ACTIVE') {
                await logger.auditLog({
                    event_type: 'AUTH_FAILED',
                    user_id: voter.voter_id,
                    severity: 'HIGH',
                    metadata: {
                        reason: `Voter status: ${voter.status}`,
                        terminal_id: terminalId
                    }
                });

                return {
                    success: false,
                    error: `Voter account is ${voter.status}`
                };
            }

            // 4. Generate JWT token
            const token = this.generateToken(voter);

            // 5. Log successful authentication
            await logger.auditLog({
                event_type: 'VOTER_AUTHENTICATED',
                user_id: voter.voter_id,
                metadata: {
                    terminal_id: terminalId,
                    district_id: voter.district_id
                }
            });

            return {
                success: true,
                token,
                voter: {
                    id: voter.voter_id,
                    name: voter.name,
                    districtId: voter.district_id,
                    // Never include bio_hash or aadhar in response
                }
            };

        } catch (error) {
            logger.error('Biometric authentication error:', error);
            throw error;
        }
    }

    /**
     * Check if voter has already voted in specific election
     * @param {String} voterId - Voter ID
     * @param {String} electionId - Election ID
     * @returns {Promise<Boolean>} Has voted status
     */
    async hasVoted(voterId, electionId) {
        const record = await VotingRecord.findOne({
            where: {
                voter_id: voterId,
                election_id: electionId
            }
        });

        return record && record.has_voted;
    }

    /**
     * Validate biometric hash format
     * @param {String} hash - Hash to validate
     * @returns {Boolean} Is valid
     */
    isValidHash(hash) {
        // SHA-256 produces 64 hexadecimal characters
        return /^[a-f0-9]{64}$/i.test(hash);
    }

    /**
     * Generate JWT token for authenticated voter
     * @param {Object} voter - Voter object
     * @returns {String} JWT token
     */
    generateToken(voter) {
        const payload = {
            id: voter.voter_id,
            type: 'VOTER',
            districtId: voter.district_id,
            // Intentionally DO NOT include biometric hash or Aadhar
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            {
                expiresIn: '24h', // Token valid for election day
                issuer: 'election-system',
                audience: 'voter'
            }
        );

        return token;
    }

    /**
     * Verify JWT token
     * @param {String} token - JWT token
     * @returns {Object} Decoded token payload
     */
    verifyToken(token) {
        try {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET,
                {
                    issuer: 'election-system',
                    audience: 'voter'
                }
            );

            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Authentication token has expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid authentication token');
            }
            throw error;
        }
    }

    /**
     * Refresh authentication token (extend session)
     * @param {String} oldToken - Current token
     * @returns {String} New token
     */
    async refreshToken(oldToken) {
        try {
            const decoded = this.verifyToken(oldToken);

            // Fetch fresh voter data
            const voter = await Voter.findByPk(decoded.id);

            if (!voter || voter.status !== 'ACTIVE') {
                throw new Error('Cannot refresh token for inactive voter');
            }

            // Generate new token
            const newToken = this.generateToken(voter);

            await logger.auditLog({
                event_type: 'TOKEN_REFRESHED',
                user_id: voter.voter_id,
                metadata: {
                    old_exp: new Date(decoded.exp * 1000),
                    new_exp: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
            });

            return newToken;

        } catch (error) {
            logger.error('Token refresh error:', error);
            throw error;
        }
    }

    /**
     * Log authentication attempt (success or failure)
     * Used for fraud detection and security monitoring
     * @param {Object} attemptData - Authentication attempt details
     */
    async logAttempt(attemptData) {
        const {
            success,
            voterId,
            terminalId,
            biometricConfidence,
            retryCount,
            error
        } = attemptData;

        await logger.auditLog({
            event_type: success ? 'AUTH_SUCCESS' : 'AUTH_ATTEMPT_FAILED',
            user_id: voterId || null,
            severity: success ? 'INFO' : 'MEDIUM',
            metadata: {
                terminal_id: terminalId,
                biometric_confidence: biometricConfidence,
                retry_count: retryCount,
                error: error || null,
                timestamp: new Date()
            }
        });

        // Check for suspicious patterns
        if (retryCount > 3) {
            await this.flagSuspiciousActivity(terminalId, 'Multiple failed biometric attempts');
        }
    }

    /**
     * Flag suspicious authentication activity
     * @param {String} terminalId - Terminal ID
     * @param {String} reason - Reason for flagging
     */
    async flagSuspiciousActivity(terminalId, reason) {
        await logger.auditLog({
            event_type: 'SUSPICIOUS_AUTH_ACTIVITY',
            severity: 'HIGH',
            metadata: {
                terminal_id: terminalId,
                reason,
                timestamp: new Date()
            }
        });

        // Could trigger ML fraud detection here
        const fraudDetectionService = require('./fraudDetectionService');
        await fraudDetectionService.analyzeAuthPattern(terminalId);
    }

    /**
     * Get authentication statistics for monitoring
     * @param {String} terminalId - Terminal ID (optional)
     * @param {Number} hours - Time window in hours
     * @returns {Promise<Object>} Statistics
     */
    async getAuthStats(terminalId = null, hours = 1) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);

        const query = {
            event_type: { $in: ['AUTH_SUCCESS', 'AUTH_ATTEMPT_FAILED'] },
            timestamp: { $gte: since }
        };

        if (terminalId) {
            query['metadata.terminal_id'] = terminalId;
        }

        const logs = await logger.findAuditLog(query);

        const stats = {
            total: logs.length,
            success: logs.filter(l => l.event_type === 'AUTH_SUCCESS').length,
            failed: logs.filter(l => l.event_type === 'AUTH_ATTEMPT_FAILED').length,
            successRate: 0,
            avgRetries: 0
        };

        if (stats.total > 0) {
            stats.successRate = (stats.success / stats.total * 100).toFixed(2);

            const retries = logs
                .filter(l => l.metadata.retry_count)
                .map(l => l.metadata.retry_count);

            if (retries.length > 0) {
                stats.avgRetries = (retries.reduce((a, b) => a + b, 0) / retries.length).toFixed(2);
            }
        }

        return stats;
    }
}

module.exports = new BiometricAuthService();
