const express = require('express');
const crypto = require('crypto');
const {
    BoothSession,
    Election,
    Voter,
    BallotToken,
    VoteAttempt,
    ManualOverrideRequest,
} = require('../models/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');
const voteContextService = require('../contexts/vote/vote-context.service.js');

const router = express.Router();

const canAccessSession = (req, session) => {
    if (!session) return false;
    if (req.user?.role === 'admin') return true;
    return req.user?.role === 'supervisor' && req.user?.adminId === session.supervisor_admin_id;
};

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * POST /api/v1/ballots/issue
 */
router.post('/issue', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const { sessionId, voterId, ttlSeconds = 120 } = req.body || {};
        if (!sessionId || !voterId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['sessionId', 'voterId'],
            });
        }

        const session = await BoothSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
        if (!canAccessSession(req, session)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to issue ballots in this session' });
        }
        if (session.status !== 'ACTIVE') {
            return res.status(409).json({
                success: false,
                code: 'SESSION_NOT_ACTIVE',
                error: 'Session must be ACTIVE to issue ballot token',
            });
        }

        const [election, voter] = await Promise.all([
            Election.findByPk(session.election_id),
            Voter.findByPk(voterId),
        ]);

        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });
        if (!voter) return res.status(404).json({ success: false, error: 'Voter not found' });
        if (req.user.role === 'admin' && req.user.adminRole !== 'SUPER_ADMIN' && election.created_by_admin_id !== req.user.adminId) {
            return res.status(403).json({
                success: false,
                error: 'You can only issue ballot tokens for elections that you manage',
            });
        }
        if (!['ACTIVE', 'ACTIVE_POLLING'].includes(election.status)) {
            return res.status(409).json({
                success: false,
                code: 'ELECTION_STATE_INVALID',
                error: `Election state ${election.status} does not allow ballot issuance`,
            });
        }
        if (voter.has_voted) {
            return res.status(409).json({
                success: false,
                code: 'DUPLICATE_VOTE_ATTEMPT',
                error: 'Voter has already voted',
            });
        }

        const hasVerifiedAttempt = await VoteAttempt.findOne({
            where: {
                election_id: session.election_id,
                voter_id: voter.voter_id,
                booth_session_id: session.session_id,
                attempt_type: 'VERIFICATION',
                outcome: 'VERIFIED',
            },
            order: [['attempted_at', 'DESC']],
        });

        const hasApprovedOverride = await ManualOverrideRequest.findOne({
            where: {
                election_id: session.election_id,
                voter_id: voter.voter_id,
                booth_session_id: session.session_id,
                status: 'APPROVED',
            },
            order: [['resolved_at', 'DESC']],
        });

        if (!hasVerifiedAttempt && !hasApprovedOverride) {
            return res.status(409).json({
                success: false,
                code: 'OVERRIDE_APPROVAL_REQUIRED',
                error: 'Voter must pass biometric verification or receive approved override before ballot issuance',
            });
        }

        const existingToken = await BallotToken.findOne({
            where: {
                election_id: session.election_id,
                voter_id: voter.voter_id,
                status: 'ISSUED',
            },
            order: [['issued_at', 'DESC']],
        });

        if (existingToken && new Date(existingToken.expires_at) > new Date()) {
            return res.status(409).json({
                success: false,
                code: 'BALLOT_TOKEN_INVALID',
                error: 'An active ballot token is already issued for this voter',
            });
        }

        const boundedTtl = Math.max(30, Math.min(Number(ttlSeconds) || 120, 600));
        const token = crypto.randomBytes(24).toString('hex');
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + boundedTtl * 1000);

        const ballotToken = await BallotToken.create({
            election_id: session.election_id,
            voter_id: voter.voter_id,
            booth_session_id: session.session_id,
            terminal_id: session.terminal_id,
            issued_by_admin_id: req.user.adminId || null,
            token_hash: tokenHash,
            issued_at: new Date(),
            expires_at: expiresAt,
            status: 'ISSUED',
            reason_code: hasApprovedOverride ? 'MANUAL_OVERRIDE_APPROVED' : 'BIOMETRIC_VERIFIED',
            metadata: {
                issuedByRole: req.user.role,
            },
        });

        await VoteAttempt.create({
            election_id: session.election_id,
            voter_id: voter.voter_id,
            booth_session_id: session.session_id,
            terminal_id: session.terminal_id,
            attempt_type: 'BALLOT_ISSUE',
            outcome: 'VERIFIED',
            reason_code: 'TOKEN_ISSUED',
            metadata: {
                tokenId: ballotToken.token_id,
                expiresAt: expiresAt.toISOString(),
            },
        });

        return res.status(201).json({
            success: true,
            data: {
                tokenId: ballotToken.token_id,
                token,
                expiresAt: ballotToken.expires_at,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to issue ballot token', message: error.message });
    }
});

/**
 * POST /api/v1/ballots/consume
 */
router.post('/consume', async (req, res) => {
    try {
        const { token, candidateId, terminalId } = req.body || {};
        if (!token || !candidateId || !terminalId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['token', 'candidateId', 'terminalId'],
            });
        }

        const tokenHash = hashToken(token);
        const ballotToken = await BallotToken.findOne({
            where: {
                token_hash: tokenHash,
            },
        });

        if (!ballotToken) {
            return res.status(404).json({ success: false, code: 'BALLOT_TOKEN_INVALID', error: 'Ballot token not found' });
        }
        if (ballotToken.status !== 'ISSUED') {
            return res.status(409).json({ success: false, code: 'BALLOT_TOKEN_INVALID', error: `Ballot token is ${ballotToken.status}` });
        }

        const now = new Date();
        if (new Date(ballotToken.expires_at) <= now) {
            await ballotToken.update({ status: 'EXPIRED' });
            return res.status(409).json({
                success: false,
                code: 'BALLOT_TOKEN_EXPIRED',
                error: 'Ballot token has expired',
            });
        }

        const voter = await Voter.findByPk(ballotToken.voter_id);
        if (!voter) {
            return res.status(404).json({ success: false, code: 'VOTER_NOT_FOUND', error: 'Voter not found for token' });
        }

        const voteResult = await voteContextService.castVote({
            voterId: ballotToken.voter_id,
            electionId: ballotToken.election_id,
            candidateId,
            districtId: voter.district_id,
            terminalId,
            timestamp: Date.now(),
            nonce: crypto.randomBytes(16).toString('hex'),
            biometricHash: voter.biometric_hash || 'manual_override',
        });

        await ballotToken.update({
            status: 'CONSUMED',
            consumed_at: new Date(),
            terminal_id: terminalId,
        });

        await VoteAttempt.create({
            election_id: ballotToken.election_id,
            voter_id: ballotToken.voter_id,
            booth_session_id: ballotToken.booth_session_id,
            terminal_id: terminalId,
            attempt_type: 'VOTE_CAST',
            outcome: 'VOTE_CAST',
            reason_code: 'TOKEN_CONSUMED',
            metadata: {
                tokenId: ballotToken.token_id,
                voteId: voteResult.voteId,
            },
        });

        return res.json({
            success: true,
            message: 'Ballot consumed and vote cast successfully',
            data: {
                tokenId: ballotToken.token_id,
                voteId: voteResult.voteId,
                receipt: voteResult.receipt,
                blockchainTxId: voteResult.blockchainTxId,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to consume ballot token', message: error.message });
    }
});

module.exports = router;
