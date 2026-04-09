const express = require('express');
const crypto = require('crypto');
const fabricService = require('../services/fabricService.js');
const { Voter, VotingRecord, Election } = require('../models/index.js');
const { voteLimiter, resultsLimiter, verifyLimiter } = require('../middleware/rateLimit.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const logger = require('../utils/logger.js');
const { publishTelemetry } = require('../services/kafkaProducer.js');
const { broadcastMessage } = require('../services/websocket.service.js');
const { redisClient } = require('../db/index.js');
const AuditLog = require('../models/auditLog.model.js');

const router = express.Router();

const voteContextService = require('../contexts/vote/vote-context.service.js');

/**
 * POST /api/v1/votes/sos
 * Emergency/SOS from terminal UI (voter or admin authenticated)
 */
router.post('/sos', authenticate, async (req, res) => {
    try {
        const {
            terminalId = 'TERM-WEB-001',
            electionId = null,
            districtId = null,
            reason = 'HELP_REQUEST',
            message = 'Voter requested assistance',
        } = req.body || {};

        const payload = {
            terminalId,
            electionId,
            districtId,
            reason,
            message,
            raisedBy: req.user?.voterId || req.user?.adminId || 'unknown',
            timestamp: new Date().toISOString(),
        };

        try {
            broadcastMessage('SOS_ALERT', payload);
        } catch (error) {
            logger.warn('Failed to broadcast SOS alert over WebSocket', { error: error.message });
        }

        logger.warn('SOS_ALERT_RAISED', payload);
        try {
            await AuditLog.create({
                event_type: 'SOS_ALERT',
                action: 'SOS_TRIGGERED',
                user_id: String(payload.raisedBy),
                terminal_id: String(payload.terminalId),
                election_id: payload.electionId ? String(payload.electionId) : undefined,
                details: payload,
                status: 'pending',
            });
        } catch (error) {
            logger.warn('Failed to persist SOS alert audit record', { error: error.message });
        }
        return res.status(201).json({ success: true, message: 'SOS alert sent', alert: payload });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to send SOS alert', message: error.message });
    }
});

/**
 * POST /api/v1/votes/cast
 * Cast a vote
 */
router.post('/cast', voteLimiter, async (req, res) => {
    logger.info('VOTE_CAST_REQUEST', {
        voterId: req.body.voterId,
        electionId: req.body.electionId,
        terminalId: req.body.terminalId,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    try {
        const {
            voterId,
            electionId,
            candidateId,
            district,
            biometricHash,
            terminalId,
            zkpCommitment,
            encryptedVote,
            nonce,
            timestamp,
            ranking
        } = req.body;

        // Validate required fields
        if (!voterId || !electionId || !candidateId || !district || !biometricHash || !terminalId) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['voterId', 'electionId', 'candidateId', 'district', 'biometricHash', 'terminalId'],
            });
        }

        // Use VoteService for the full business logic (ZKP, Encryption, Fabric, SQL, Kafka)
        const result = await voteContextService.castVote({
            voterId,
            electionId,
            candidateId,
            districtId: district,
            terminalId,
            biometricHash,
            zkpCommitment,
            encryptedVote,
            nonce,
            timestamp: timestamp || Date.now(),
            ranking: Array.isArray(ranking) ? ranking : null,
        });

        res.status(201).json({
            success: true,
            message: 'Vote cast successfully',
            voteId: result.voteId,
            receipt: result.receipt,
            blockchainTxId: result.blockchainTxId
        });

    } catch (error) {
        logger.error('Vote casting error:', error.message);

        const status = error.message.includes('already voted') ? 409 : 500;
        res.status(status).json({
            error: 'Vote casting failed',
            message: error.message,
        });
    }
});

/**
 * GET /api/v1/votes/status/:voterId/:electionId
 * Check voter status
 */
router.get('/status/:voterId/:electionId', async (req, res) => {
    try {
        const { voterId, electionId } = req.params;

        // Check database
        const voter = await Voter.findByPk(voterId);
        if (!voter) {
            return res.status(404).json({
                error: 'Voter not found',
            });
        }

        const votingRecord = await VotingRecord.findOne({
            where: { voter_id: voterId, election_id: electionId },
        });

        // Check blockchain
        let blockchainStatus;
        try {
            blockchainStatus = await fabricService.checkVoterStatus(voterId, electionId);
        } catch (error) {
            // Voter might not be registered on blockchain yet
            blockchainStatus = null;
        }

        res.json({
            voterId,
            electionId,
            hasVoted: voter.has_voted,
            votingRecord: votingRecord ? {
                voteTimestamp: votingRecord.vote_timestamp,
                blockchainTxId: votingRecord.blockchain_tx_id,
            } : null,
            blockchainStatus,
        });

    } catch (error) {
        console.error('Status check error:', error.message);
        res.status(500).json({
            error: 'Failed to check status',
            message: error.message,
        });
    }
});

/**
 * GET /api/v1/votes/results/:electionId
 * Get election results
 */
router.get('/results/:electionId', resultsLimiter, async (req, res) => {
    try {
        const { electionId } = req.params;
        const cacheKey = `results:election:${electionId}`;

        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        } catch (cacheErr) {
            logger.warn('Vote results cache read failed', { error: cacheErr.message });
        }

        // Get results from blockchain (source of truth)
        const results = await fabricService.getResults(electionId);

        // Get election details from database
        const election = await Election.findByPk(electionId);

        const totalVotesCast = await VotingRecord.count({ where: { election_id: electionId } });

        const payload = {
            election: election ? {
                id: election.election_id,
                name: election.name,
                type: election.election_type,
                status: String(election.status || '').toLowerCase(),
                totalVotesCast,
            } : null,
            blockchainResults: results,
            timestamp: new Date().toISOString(),
        };

        try {
            await redisClient.set(cacheKey, JSON.stringify(payload), { EX: Number(process.env.RESULTS_CACHE_TTL_SEC || 15) });
        } catch (cacheErr) {
            logger.warn('Vote results cache write failed', { error: cacheErr.message });
        }

        res.json(payload);

    } catch (error) {
        console.error('Results retrieval error:', error.message);
        res.status(500).json({
            error: 'Failed to get results',
            message: error.message,
        });
    }
});

/**
 * GET /api/v1/votes/verify/:receiptId
 * Verify a vote receipt against the blockchain
 */
router.get('/verify/:receiptId', verifyLimiter, async (req, res) => {
    try {
        const { receiptId } = req.params;

        const result = await voteContextService.verifyReceipt(receiptId);

        if (!result.verified) {
            return res.status(404).json({
                success: false,
                verified: false,
                error: result.error || 'Receipt not found on blockchain.',
            });
        }

        res.json({
            success: true,
            ...result,
        });

    } catch (error) {
        console.error('Verification error:', error.message);
        res.status(500).json({
            success: false,
            verified: false,
            error: 'Verification failed. Please try again.',
        });
    }
});

/**
 * GET /api/v1/votes/:voteId
 * Get specific vote details (for verification)
 */
router.get('/:voteId', authenticate, async (req, res) => {
    try {
        const { voteId } = req.params;

        const vote = await fabricService.getVoteById(voteId);

        res.json({
            vote,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('Vote retrieval error:', error.message);
        res.status(404).json({
            error: 'Vote not found',
            message: error.message,
        });
    }
});

module.exports = router;
