const express = require('express');
const crypto = require('crypto');
const fabricService = require('../services/fabricService.js');
const { Voter, VotingRecord, Election } = require('../models/index.js');
const { voteLimiter } = require('../middleware/rateLimit.middleware.js');
const { authenticate } = require('../middleware/auth.middleware.js');
const logger = require('../utils/logger.js');
const { publishTelemetry } = require('../services/kafkaProducer.js');
const { broadcastMessage } = require('../services/websocket.service.js');

const router = express.Router();

const voteService = require('../services/voteService.js');

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
            encryptedVote
        } = req.body;

        // Validate required fields
        if (!voterId || !electionId || !candidateId || !district || !biometricHash || !terminalId) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['voterId', 'electionId', 'candidateId', 'district', 'biometricHash', 'terminalId'],
            });
        }

        // Use VoteService for the full business logic (ZKP, Encryption, Fabric, SQL, Kafka)
        const result = await voteService.castVote({
            voterId,
            electionId,
            candidateId,
            districtId: district,
            terminalId,
            biometricHash,
            zkpCommitment,
            encryptedVote,
            timestamp: Date.now()
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
router.get('/results/:electionId', async (req, res) => {
    try {
        const { electionId } = req.params;

        // Get results from blockchain (source of truth)
        const results = await fabricService.getResults(electionId);

        // Get election details from database
        const election = await Election.findByPk(electionId);

        res.json({
            election: election ? {
                id: election.election_id,
                name: election.name,
                type: election.election_type,
                status: election.status,
                totalVotesCast: election.total_votes_cast || 0,
            } : null,
            blockchainResults: results,
            timestamp: new Date().toISOString(),
        });

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
router.get('/verify/:receiptId', async (req, res) => {
    try {
        const { receiptId } = req.params;

        // Look up the voting record by verification hash or receipt ID
        const votingRecord = await VotingRecord.findOne({
            where: { verification_hash: receiptId },
        });

        if (!votingRecord) {
            return res.status(404).json({
                success: false,
                verified: false,
                error: 'Receipt not found on blockchain.',
            });
        }

        // Attempt to verify on blockchain
        let blockchainVote = null;
        try {
            blockchainVote = await fabricService.getVoteById(votingRecord.blockchain_tx_id);
        } catch (err) {
            // Blockchain might not be available, fall back to DB record
        }

        res.json({
            success: true,
            verified: true,
            vote: {
                voteId: votingRecord.record_id,
                timestamp: votingRecord.vote_timestamp,
                blockchainTxId: votingRecord.blockchain_tx_id,
                blockNumber: blockchainVote?.blockNumber || null,
                districtId: blockchainVote?.district || null,
                terminalId: votingRecord.terminal_id,
                integrityVerified: !!blockchainVote,
            },
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
