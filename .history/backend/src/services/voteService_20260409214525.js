/**
 * Vote Casting Service
 * Handles vote submission, blockchain integration, and offline reconciliation
 */

const { Voter, Election, Candidate, VotingRecord, VoteNonce, VoteSagaStatus } = require('../models/index.js');
const fabricService = require('./fabricService.js');
const zkpService = require('./zkpService.js');
const eligibilityService = require('./eligibilityService.js');
const logger = require('../utils/logger.js');
const AuditLog = require('../models/auditLog.model.js');
const crypto = require('crypto');
const { sequelize, redisClient } = require('../db/index.js');
const reconciliationSaga = require('./reconciliationSaga.service.js');
const { voteCastLatencyMs, fabricFallbackTotal } = require('./observability.service.js');
const { getQualifiedTableName } = require('../contexts/context.config.js');

const isTruthy = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

class VoteService {
    /**
     * Cast a vote
     * @param {Object} voteData - Vote information
     * @returns {Promise<Object>} Vote receipt
     */
    async castVote(voteData) {
        const startedAt = Date.now();
        const {
            voterId,
            electionId,
            candidateId,
            districtId,
            terminalId,
            timestamp,
            encryptedVote,
            zkpCommitment,
            nonce,
            biometricHash
            ,ranking
        } = voteData;

        try {
            const requiresZkp = isTruthy(process.env.ENFORCE_ZKP_VERIFICATION, process.env.NODE_ENV === 'production');
            const enforceReplayProtection = isTruthy(process.env.ENFORCE_VOTE_REPLAY_PROTECTION, true);
            const allowedSkewMs = Number(process.env.VOTE_TIMESTAMP_WINDOW_MS || 5 * 60 * 1000);
            const nowMs = Date.now();
            const requestTs = Number(timestamp || nowMs);

            if (Number.isNaN(requestTs)) {
                throw new Error('Invalid vote timestamp');
            }

            if (enforceReplayProtection && Math.abs(nowMs - requestTs) > allowedSkewMs) {
                throw new Error('Vote timestamp outside allowed window');
            }

            const effectiveNonce = nonce || crypto.createHash('sha256')
                .update(`${voterId}:${electionId}:${candidateId}:${requestTs}:${terminalId}`)
                .digest('hex');

            // 1. Verify election is active
            const election = await Election.findByPk(electionId);

            if (!election) {
                throw new Error('Election not found');
            }

            if (election.status !== 'ACTIVE') {
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

            // 2. Verify candidate exists in this election
            const candidate = await Candidate.findOne({
                where: { candidate_id: candidateId, election_id: electionId }
            });

            if (!candidate) {
                throw new Error('Invalid candidate for this election');
            }

            // 3. Verify ZKP commitment (enforceable via env)
            if (requiresZkp && (!zkpCommitment || !encryptedVote)) {
                throw new Error('ZKP commitment and encrypted vote are required');
            }
            if (zkpCommitment && encryptedVote) {
                try {
                    const zkpValid = await zkpService.verifyCommitment(zkpCommitment, encryptedVote);
                    if (!zkpValid) throw new Error('Invalid ZKP commitment');
                } catch (zkpErr) {
                    if (requiresZkp) {
                        throw zkpErr;
                    }
                    logger.warn('ZKP verification skipped (non-fatal in relaxed mode):', { error: zkpErr.message });
                }
            }

            let voteId = null;
            let verificationHash = null;
            let blockchainTxId = null;
            let saltedBiometricHash = null;
            let blockchainDeferred = false;
            let sagaStatus = null;

            // 4. Transactional section to avoid check-insert race windows.
            await sequelize.transaction(async (tx) => {
                const voter = await Voter.findByPk(voterId, {
                    transaction: tx,
                    lock: tx.LOCK.UPDATE,
                });

                if (!voter) throw new Error('Voter not found');
                if (voter.status !== 'active') throw new Error('Voter is not active');

                // Enforce admin-scoped election eligibility
                if (voter.admin_id && election.created_by_admin_id && voter.admin_id !== election.created_by_admin_id) {
                    throw new Error('Voter is not eligible for this election');
                }

                const eligibility = await eligibilityService.evaluateVoter(voter, election, {
                    districtId,
                    terminalId,
                });
                if (!eligibility.eligible) {
                    throw new Error(`Voter is not eligible for this election: ${eligibility.reasons.join('; ')}`);
                }

                const existingVote = await VotingRecord.findOne({
                    where: { voter_id: voterId, election_id: electionId },
                    transaction: tx,
                    lock: tx.LOCK.UPDATE,
                });
                if (sequelize.getDialect() !== 'sqlite') {
                    const votingRecordsTable = getQualifiedTableName('voting_records', sequelize.getDialect());
                    await sequelize.query(
                        `
                        SELECT voter_id
                        FROM ${votingRecordsTable}
                        WHERE voter_id = :voterId AND election_id = :electionId
                        FOR UPDATE
                        `,
                        {
                            replacements: { voterId, electionId },
                            transaction: tx,
                        }
                    );
                }
                if (existingVote || voter.has_voted) {
                    throw new Error('Voter has already voted in this election');
                }

                // Optional pre-flight blockchain status check (double-spend protection)
                try {
                    const chainStatus = await fabricService.checkVoterStatus(voterId, electionId);
                    if (chainStatus?.hasVoted || chainStatus?.voted) {
                        throw new Error('DOUBLE_VOTE_ATTEMPT: voter already marked as voted on blockchain');
                    }
                } catch (chainCheckErr) {
                    // If blockchain status check endpoint unavailable, continue.
                    logger.warn('Blockchain pre-check unavailable:', { error: chainCheckErr.message });
                }

                if (enforceReplayProtection) {
                    const existingNonce = await VoteNonce.findOne({
                        where: { voter_id: voterId, election_id: electionId, nonce: effectiveNonce },
                        transaction: tx,
                        lock: tx.LOCK.UPDATE,
                    });
                    if (existingNonce) {
                        throw new Error('Replay detected: nonce already used');
                    }

                    await VoteNonce.create({
                        voter_id: voterId,
                        election_id: electionId,
                        nonce: effectiveNonce,
                        used_at: new Date(requestTs),
                    }, { transaction: tx });
                }

                voteId = crypto.randomUUID();
                sagaStatus = await VoteSagaStatus.create({
                    vote_id: voteId,
                    voter_id: voterId,
                    election_id: electionId,
                    current_state: 'PENDING',
                    state_updated_at: new Date(),
                }, { transaction: tx });

                const biometricInput = String(biometricHash || '');
                saltedBiometricHash = crypto
                    .createHash('sha256')
                    .update(`${biometricInput}:${voterId}:${electionId}:${terminalId}`)
                    .digest('hex');

                verificationHash = crypto.createHash('sha256')
                    .update(`${voterId}:${electionId}:${candidateId}:${requestTs}:${effectiveNonce}:${saltedBiometricHash}`)
                    .digest('hex');

                try {
                    const blockchainTx = await fabricService.submitVote({
                        voteId,
                        voterId,
                        electionId,
                        candidateId: encryptedVote || candidateId,
                        districtId,
                        terminalId,
                        verificationHash,
                        zkpCommitment,
                        timestamp: requestTs
                    });
                    blockchainTxId = blockchainTx?.txId || blockchainTx || verificationHash;
                    await sagaStatus.update({
                        current_state: 'BLOCKCHAIN_OK',
                        last_error: null,
                        state_updated_at: new Date(),
                    }, { transaction: tx });
                } catch (fabricErr) {
                    logger.warn('Blockchain unavailable, falling back to DB-only vote:', { error: fabricErr.message });
                    blockchainTxId = verificationHash;
                    blockchainDeferred = true;
                    fabricFallbackTotal.inc();
                    await sagaStatus.update({
                        current_state: 'PENDING',
                        last_error: `BLOCKCHAIN_DEFERRED:${fabricErr.message}`,
                        state_updated_at: new Date(),
                    }, { transaction: tx });
                }

                const votingRecord = await VotingRecord.create({
                    record_id: voteId,
                    voter_id: voterId,
                    election_id: electionId,
                    terminal_id: terminalId,
                    verification_hash: verificationHash,
                    biometric_hash_salted: saltedBiometricHash,
                    request_nonce: effectiveNonce,
                    blockchain_tx_id: blockchainTxId,
                    vote_timestamp: new Date(requestTs),
                    ranking_payload: Array.isArray(ranking) && ranking.length > 0 ? ranking : null,
                }, { transaction: tx });

                await voter.update({ has_voted: true }, { transaction: tx });
                if (!blockchainDeferred) {
                    await sagaStatus.update({
                        current_state: 'SQL_OK',
                        last_error: null,
                        state_updated_at: new Date(),
                    }, { transaction: tx });
                }

                if (blockchainDeferred) {
                    const outbox = await reconciliationSaga.enqueueVoteSync({
                        voteId,
                        recordId: votingRecord.record_id,
                        voterId,
                        electionId,
                        candidateId: encryptedVote || candidateId,
                        districtId,
                        terminalId,
                        verificationHash,
                        zkpCommitment,
                        timestamp: requestTs,
                    }, tx);
                    await sagaStatus.update({
                        outbox_event_id: outbox.event_id,
                        state_updated_at: new Date(),
                    }, { transaction: tx });
                }
            });

            // 5. Post-commit blockchain consistency check (best-effort)
            try {
                const chainStatusAfter = await fabricService.checkVoterStatus(voterId, electionId);
                if (chainStatusAfter && !(chainStatusAfter.hasVoted || chainStatusAfter.voted)) {
                    logger.warn('Possible chain/db mismatch after vote commit', { voterId, electionId, blockchainTxId });
                }
            } catch (error) {
                logger.warn('Blockchain post-check unavailable:', { error: error.message });
            }

            // 6. Generate receipt
            const receipt = this.generateReceipt({
                voteId,
                electionId,
                timestamp: requestTs,
                blockchainTxId,
                verificationHash,
                zkpCommitment
            });

            // 7. Async: fire telemetry + broadcast (non-fatal)
            try {
                const { publishTelemetry } = require('./kafkaProducer.js');
                await publishTelemetry('election-telemetry', 'VOTE_CAST', {
                    voterId, electionId, candidateId,
                    district: districtId, terminalId,
                    timestamp: requestTs, voteId,
                    nonce: effectiveNonce
                });
            } catch (error) {
                logger.warn('Kafka telemetry publish skipped', { error: error.message });
            }

            try {
                const { publishPartitionedIoTBroadcast } = require('./kafkaProducer.js');
                await publishPartitionedIoTBroadcast({
                    electionId,
                    districtId,
                    messageType: 'IOT_VOTE_EVENT',
                    data: {
                        voteId,
                        terminalId,
                        timestamp: requestTs,
                    },
                });
            } catch (error) {
                logger.warn('Kafka IoT broadcast skipped', { error: error.message });
            }

            try {
                const { broadcastMessage } = require('./websocket.service.js');
                broadcastMessage('VOTE_CAST', { electionId, candidateId, district: districtId, timestamp: requestTs });
            } catch (error) {
                logger.warn('WebSocket broadcast skipped', { error: error.message });
            }

            // Invalidate cached results for this election
            try {
                const electionCacheKey = `results:election:${electionId}`;
                await redisClient.del(electionCacheKey);
            } catch (cacheErr) {
                logger.warn('Failed to invalidate results cache', { error: cacheErr.message });
            }

            // 8. Audit log (MongoDB)
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
                        nonce: effectiveNonce,
                    }
                });
            } catch { /* audit non-fatal */ }
            try {
                if (!blockchainDeferred) {
                    await VoteSagaStatus.update(
                        { current_state: 'NOTIFIED', last_error: null, state_updated_at: new Date() },
                        { where: { vote_id: voteId } }
                    );
                }
            } catch (sagaErr) {
                logger.warn('Failed to mark vote saga as NOTIFIED', { voteId, error: sagaErr.message });
            }

            voteCastLatencyMs.observe(Date.now() - startedAt);

            return {
                success: true,
                voteId,
                receipt,
                blockchainTxId
            };

        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                error.message = 'Voter has already voted in this election';
            }
            logger.error('Error casting vote:', { error: error.message });
            voteCastLatencyMs.observe(Date.now() - startedAt);

            // Log failed attempt
            try {
                await AuditLog.create({
                    event_type: 'VOTE_CAST_FAILED',
                    user_id: voterId,
                    severity: 'HIGH',
                    metadata: { election_id: electionId, terminal_id: terminalId, error: error.message }
                });
            } catch (auditErr) {
                logger.warn('Failed to write vote cast failure audit log', { error: auditErr.message });
            }

            if (error.message && /insert|constraint|sequelize|sql/i.test(error.message)) {
                await reconciliationSaga.enqueueDeadLetter({
                    sourceEventId: null,
                    eventType: 'SQL_RECORD_FAILED',
                    payload: {
                        voterId,
                        electionId,
                        candidateId,
                        districtId,
                        terminalId,
                        nonce,
                        timestamp,
                    },
                    errorMessage: error.message,
                });
            }
            try {
                if (voteId && voterId && electionId) {
                    await VoteSagaStatus.upsert({
                        vote_id: voteId,
                        voter_id: voterId,
                        election_id: electionId,
                        current_state: 'FAILED',
                        last_error: error.message,
                        state_updated_at: new Date(),
                    });
                }
            } catch (sagaErr) {
                logger.warn('Failed to mark vote saga as FAILED', { voteId, error: sagaErr.message });
            }

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
            ? verificationHash.toUpperCase()
            : crypto.createHash('sha256').update(voteId + timestamp.toString()).digest('hex').toUpperCase();

        return {
            receiptId,
            receiptShortId: receiptId.slice(0, 12),
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
            const normalized = String(receiptId || '').toLowerCase();
            if (!/^[a-f0-9]{64}$/.test(normalized)) {
                return { verified: false, error: 'Invalid receipt format. Full 64-char hash required.' };
            }

            const record = await VotingRecord.findOne({
                where: {
                    verification_hash: normalized
                }
            });

            if (!record) {
                return { verified: false, error: 'Receipt not found' };
            }

            // Try to verify on blockchain
            let blockchainVote = null;
            let integrityVerified = false;
            let merkleProof = null;
            let proofVerified = false;
            let chainHashMatches = false;
            const enforceReceiptProof = isTruthy(process.env.ENFORCE_RECEIPT_CHAIN_PROOF, process.env.NODE_ENV === 'production');
            try {
                blockchainVote = await fabricService.getVoteById(record.blockchain_tx_id);
                integrityVerified = !!blockchainVote;
                merkleProof = await fabricService.getMerkleProof(record.blockchain_tx_id);
                proofVerified = fabricService.verifyMerkleProof(merkleProof, record.blockchain_tx_id);
                const chainHash = String(
                    blockchainVote?.verificationHash ||
                    blockchainVote?.verification_hash ||
                    blockchainVote?.receiptHash ||
                    ''
                ).toLowerCase();
                chainHashMatches = !!chainHash && chainHash === normalized;
            } catch (error) {
                logger.warn('Receipt blockchain verification unavailable', { receiptId: normalized, error: error.message });
            }

            if (enforceReceiptProof && (!proofVerified || !chainHashMatches)) {
                return {
                    verified: false,
                    error: !proofVerified
                        ? 'Merkle proof validation failed'
                        : 'Blockchain hash does not match receipt hash',
                };
            }

            const proofPath = Array.isArray(merkleProof?.proof)
                ? merkleProof.proof
                : Array.isArray(merkleProof?.path)
                    ? merkleProof.path
                    : Array.isArray(merkleProof?.merklePath)
                        ? merkleProof.merklePath
                        : [];

            if (enforceReceiptProof && proofPath.length === 0) {
                return {
                    verified: false,
                    error: 'Merkle proof path is empty',
                };
            }

            return {
                verified: true,
                vote: {
                    voteId: record.record_id,
                    electionId: record.election_id,
                    timestamp: record.vote_timestamp,
                    blockchainTxId: record.blockchain_tx_id,
                    terminalId: record.terminal_id,
                    integrityVerified,
                    chainHashMatches,
                    merkleProofVerified: proofVerified,
                    blockNumber: blockchainVote?.blockNumber || null,
                    merkleProof: merkleProof || null,
                    merklePath: proofPath,
                }
            };

        } catch (error) {
            logger.error('Error verifying receipt:', { error: error.message });
            return { verified: false, error: error.message };
        }
    }
}

module.exports = new VoteService();
