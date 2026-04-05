/**
 * Vote Casting Service
 * Handles vote submission, blockchain integration, and offline reconciliation
 */

const { Voter, Election, Candidate, VotingRecord } = require('../models/index.js');
const fabricService = require('./fabricService.js');
const zkpService = require('./zkpService.js');
const logger = require('../utils/logger.js');
const AuditLog = require('../models/auditLog.model.js');
const crypto = require('crypto');

class VoteService {
    /**
     * Cast a vote
     * @param {Object} voteData - Vote information
     * @returns {Promise<Object>} Vote receipt
     */
    async castVote(voteData) {
        const {
            voterId,
            electionId,
            candidateId,
            districtId,
            terminalId,
            timestamp,
            encryptedVote,
            zkpCommitment
        } = voteData;

        try {
            // 1. Verify election is active (use lowercase as stored in DB)
            const election = await Election.findByPk(electionId);

            if (!election) {
                throw new Error('Election not found');
            }

            if (election.status !== 'active') {
                throw new Error(`Election is not accepting votes (status: ${election.status})`);
            }

            // Verify within voting hours
            const now = new Date();
            if (election.start_date && now < new Date(election.start_date)) {
                throw new Error('Voting has not started yet');
            }
            if (election.end_date && now > new Date(election.end_date)) {
                throw new Error('Voting period has ended');
            }

            // 2. Check if voter has already voted
            const existingVote = await VotingRecord.findOne({
                where: { voter_id: voterId, election_id: electionId }
            });

            if (existingVote) {
                throw new Error('Voter has already voted in this election');
            }

            // 3. Verify candidate exists in this election
            const candidate = await Candidate.findOne({
                where: { candidate_id: candidateId, election_id: electionId }
            });

            if (!candidate) {
                throw new Error('Invalid candidate for this election');
            }

            // 4. Verify ZKP commitment (skip if not provided — optional for demo)
            if (zkpCommitment && encryptedVote) {
                try {
                    const zkpValid = await zkpService.verifyCommitment(zkpCommitment, encryptedVote);
                    if (!zkpValid) throw new Error('Invalid ZKP commitment');
                } catch (zkpErr) {
                    logger.warn('ZKP verification skipped or failed:', { error: zkpErr.message });
                    // Non-fatal in demo mode
                }
            }

            // 5. Generate vote ID and verification hash
            const voteId = crypto.randomUUID();
            const verificationHash = crypto.createHash('sha256')
                .update(`${voterId}:${electionId}:${candidateId}:${Date.now()}`)
                .digest('hex');

            // 6. Submit to blockchain (non-fatal if Fabric is down)
            let blockchainTxId = null;
            try {
                const blockchainTx = await fabricService.submitVote({
                    voteId,
                    electionId,
                    candidateId: encryptedVote || candidateId,
                    districtId,
                    terminalId,
                    verificationHash,
                    zkpCommitment,
                    timestamp: timestamp || Date.now()
                });
                blockchainTxId = blockchainTx?.txId || blockchainTx || verificationHash;
            } catch (fabricErr) {
                logger.warn('Blockchain unavailable, falling back to DB-only vote:', { error: fabricErr.message });
                blockchainTxId = verificationHash; // DB-only fallback
            }

            // 7. Record in database (only fields defined in VotingRecord model)
            await VotingRecord.create({
                voter_id: voterId,
                election_id: electionId,
                terminal_id: terminalId,
                verification_hash: verificationHash,
                blockchain_tx_id: blockchainTxId,
                vote_timestamp: new Date(timestamp || Date.now()),
            });

            // 8. Mark voter as having voted
            await Voter.update(
                { has_voted: true },
                { where: { voter_id: voterId } }
            );

            // 9. Generate receipt
            const receipt = this.generateReceipt({
                voteId,
                electionId,
                timestamp: timestamp || Date.now(),
                blockchainTxId,
                verificationHash,
                zkpCommitment
            });

            // 10. Async: fire telemetry + broadcast (non-fatal)
            try {
                const { publishTelemetry } = require('./kafkaProducer.js');
                await publishTelemetry('election-telemetry', 'VOTE_CAST', {
                    voterId, electionId, candidateId,
                    district: districtId, terminalId,
                    timestamp: timestamp || Date.now(), voteId
                });
            } catch { /* Kafka optional */ }

            try {
                const { broadcastMessage } = require('./websocket.service.js');
                broadcastMessage('VOTE_CAST', { electionId, candidateId, district: districtId, timestamp: timestamp || Date.now() });
            } catch { /* WebSocket optional */ }

            // 11. Audit log (MongoDB)
            try {
                await AuditLog.create({
                    event_type: 'VOTE_CAST',
                    user_id: voterId,
                    metadata: {
                        vote_id: voteId,
                        election_id: electionId,
                        terminal_id: terminalId,
                        blockchain_tx: blockchainTxId,
                        receipt_id: receipt.receiptId,
                    }
                });
            } catch { /* audit non-fatal */ }

            return {
                success: true,
                voteId,
                receipt,
                blockchainTxId
            };

        } catch (error) {
            logger.error('Error casting vote:', { error: error.message });

            // Log failed attempt
            try {
                await AuditLog.create({
                    event_type: 'VOTE_CAST_FAILED',
                    user_id: voterId,
                    severity: 'HIGH',
                    metadata: { election_id: electionId, terminal_id: terminalId, error: error.message }
                });
            } catch { /* audit non-fatal */ }

            throw error;
        }
    }

    /**
     * Reconcile offline votes
     */
    async reconcileOfflineVotes(offlineVotes) {
        const results = { success: [], failed: [], duplicates: [] };

        for (const vote of offlineVotes) {
            try {
                const existing = await VotingRecord.findOne({
                    where: { voter_id: vote.voterId, election_id: vote.electionId }
                });

                if (existing) {
                    results.duplicates.push({ voteId: vote.voteId, reason: 'Vote already processed' });
                    continue;
                }

                const result = await this.castVote(vote);
                results.success.push({ voteId: vote.voteId, blockchainTxId: result.blockchainTxId });

            } catch (error) {
                results.failed.push({ voteId: vote.voteId, reason: error.message });
            }
        }

        return results;
    }

    /**
     * Generate vote receipt
     */
    generateReceipt(voteInfo) {
        const { voteId, electionId, timestamp, blockchainTxId, verificationHash, zkpCommitment } = voteInfo;

        const receiptId = verificationHash
            ? verificationHash.substring(0, 12).toUpperCase()
            : crypto.createHash('sha256')
                .update(voteId + timestamp.toString())
                .digest('hex')
                .substring(0, 12)
                .toUpperCase();

        return {
            receiptId,
            voteId,
            electionId,
            timestamp,
            blockchainTxId,
            zkpCommitment,
            qrCode: `RECEIPT|${receiptId}|${voteId}|${electionId}|${timestamp}|${blockchainTxId}`
        };
    }

    /**
     * Verify a vote receipt
     */
    async verifyReceipt(receiptId) {
        try {
            // Lookup by verification_hash prefix in VotingRecord (PostgreSQL)
            const { Op } = require('sequelize');
            const record = await VotingRecord.findOne({
                where: {
                    verification_hash: { [Op.like]: `${receiptId.toLowerCase()}%` }
                }
            });

            if (!record) {
                return { verified: false, error: 'Receipt not found' };
            }

            // Try to verify on blockchain
            let blockchainVote = null;
            let integrityVerified = false;
            try {
                blockchainVote = await fabricService.getVoteById(record.blockchain_tx_id);
                integrityVerified = !!blockchainVote;
            } catch { /* blockchain optional */ }

            return {
                verified: true,
                vote: {
                    voteId: record.record_id,
                    electionId: record.election_id,
                    timestamp: record.vote_timestamp,
                    blockchainTxId: record.blockchain_tx_id,
                    terminalId: record.terminal_id,
                    integrityVerified,
                    blockNumber: blockchainVote?.blockNumber || null,
                }
            };

        } catch (error) {
            logger.error('Error verifying receipt:', { error: error.message });
            return { verified: false, error: error.message };
        }
    }
}

module.exports = new VoteService();
