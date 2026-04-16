const express = require('express');
const {
    BoothSession,
    Election,
    Voter,
    VotingRecord,
    VoteAttempt,
    ManualOverrideRequest,
} = require('../models/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');
const eligibilityService = require('../services/eligibilityService.js');

const router = express.Router();

const canAccessSession = (req, session) => {
    if (!session) return false;
    if (req.user?.role === 'admin') return true;
    return req.user?.role === 'supervisor' && req.user?.adminId === session.supervisor_admin_id;
};

const trackVerificationAttempt = async ({
    electionId,
    voterId,
    sessionId,
    terminalId,
    outcome,
    reasonCode,
    metadata,
}) => {
    await VoteAttempt.create({
        election_id: electionId,
        voter_id: voterId || null,
        booth_session_id: sessionId || null,
        terminal_id: terminalId || null,
        attempt_type: 'VERIFICATION',
        outcome,
        reason_code: reasonCode || null,
        metadata: metadata || {},
    });
};

/**
 * POST /api/v1/verification/biometric
 */
router.post('/biometric', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const { sessionId, voterId, biometricTemplateHash, terminalNonce } = req.body || {};

        if (!sessionId || !voterId || !biometricTemplateHash) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['sessionId', 'voterId', 'biometricTemplateHash'],
            });
        }

        if (!/^[a-fA-F0-9]{64}$/.test(String(biometricTemplateHash))) {
            return res.status(400).json({
                success: false,
                code: 'BIOMETRIC_MISMATCH',
                error: 'Invalid biometric hash format',
            });
        }

        const session = await BoothSession.findByPk(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }
        if (!canAccessSession(req, session)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to use this session' });
        }
        if (session.status !== 'ACTIVE') {
            return res.status(409).json({
                success: false,
                code: 'SESSION_NOT_ACTIVE',
                error: 'Booth session is not active',
            });
        }

        const [election, voter] = await Promise.all([
            Election.findByPk(session.election_id),
            Voter.findByPk(voterId),
        ]);

        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found for session' });
        }
        if (!voter) {
            await trackVerificationAttempt({
                electionId: session.election_id,
                voterId,
                sessionId,
                terminalId: session.terminal_id,
                outcome: 'REJECTED',
                reasonCode: 'VOTER_NOT_FOUND',
            });
            return res.status(404).json({
                success: false,
                code: 'VOTER_NOT_FOUND',
                error: 'Voter not found',
            });
        }

        if (!['ACTIVE', 'ACTIVE_POLLING'].includes(election.status)) {
            await trackVerificationAttempt({
                electionId: session.election_id,
                voterId,
                sessionId,
                terminalId: session.terminal_id,
                outcome: 'REJECTED',
                reasonCode: 'ELECTION_STATE_INVALID',
            });
            return res.status(409).json({
                success: false,
                code: 'ELECTION_STATE_INVALID',
                error: `Election state ${election.status} does not allow voter verification`,
            });
        }

        const normalizedInputHash = String(biometricTemplateHash).toLowerCase();
        const normalizedStoredHash = String(voter.biometric_hash || '').toLowerCase();
        if (!normalizedStoredHash || normalizedStoredHash !== normalizedInputHash) {
            await trackVerificationAttempt({
                electionId: session.election_id,
                voterId,
                sessionId,
                terminalId: session.terminal_id,
                outcome: 'BIOMETRIC_FAIL',
                reasonCode: 'BIOMETRIC_MISMATCH',
                metadata: { terminalNonce: terminalNonce || null },
            });
            return res.status(401).json({
                success: false,
                code: 'BIOMETRIC_MISMATCH',
                error: 'Biometric verification failed',
            });
        }

        const existingVote = await VotingRecord.findOne({
            where: {
                election_id: session.election_id,
                voter_id: voter.voter_id,
            },
        });

        if (existingVote || voter.has_voted) {
            await trackVerificationAttempt({
                electionId: session.election_id,
                voterId,
                sessionId,
                terminalId: session.terminal_id,
                outcome: 'DUPLICATE',
                reasonCode: 'DUPLICATE_VOTE_ATTEMPT',
            });
            return res.status(409).json({
                success: false,
                code: 'DUPLICATE_VOTE_ATTEMPT',
                error: 'Voter has already voted in this election',
            });
        }

        const eligibility = await eligibilityService.evaluateVoter(voter, election, {
            districtId: voter.district_id,
            terminalId: session.terminal_id,
        });

        if (!eligibility.eligible) {
            await trackVerificationAttempt({
                electionId: session.election_id,
                voterId,
                sessionId,
                terminalId: session.terminal_id,
                outcome: 'INELIGIBLE',
                reasonCode: 'VOTER_INELIGIBLE',
                metadata: { reasons: eligibility.reasons },
            });
            return res.status(403).json({
                success: false,
                code: 'VOTER_INELIGIBLE',
                error: 'Voter is not eligible for this election',
                details: {
                    reasonCode: 'RULE_MISMATCH',
                    failedRules: eligibility.reasons,
                },
            });
        }

        await trackVerificationAttempt({
            electionId: session.election_id,
            voterId,
            sessionId,
            terminalId: session.terminal_id,
            outcome: 'VERIFIED',
            reasonCode: null,
            metadata: {
                terminalNonce: terminalNonce || null,
                verifiedBy: req.user.adminId || null,
            },
        });

        return res.json({
            success: true,
            data: {
                verificationStatus: 'VERIFIED',
                reasonCode: null,
                voterId: voter.voter_id,
                electionId: session.election_id,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Biometric verification failed', message: error.message });
    }
});

/**
 * POST /api/v1/verification/manual-override
 */
router.post('/manual-override', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const {
            sessionId,
            voterId,
            reasonCode,
            notes,
        } = req.body || {};

        if (!sessionId || !voterId || !reasonCode) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['sessionId', 'voterId', 'reasonCode'],
            });
        }

        const session = await BoothSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
        if (!canAccessSession(req, session)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to raise override requests in this session' });
        }

        const request = await ManualOverrideRequest.create({
            election_id: session.election_id,
            booth_session_id: session.session_id,
            voter_id: voterId,
            requested_by_admin_id: req.user.adminId,
            reason_code: reasonCode,
            details: notes || null,
            status: 'PENDING_APPROVAL',
            metadata: {
                requestedByRole: req.user.role,
            },
        });

        return res.status(201).json({
            success: true,
            data: {
                overrideRequestId: request.override_id,
                status: request.status,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to create manual override request', message: error.message });
    }
});

/**
 * POST /api/v1/verification/manual-override/:id/approve
 */
router.post('/manual-override/:id/approve', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, notes } = req.body || {};
        const normalizedDecision = String(decision || '').toUpperCase();

        if (!['APPROVE', 'REJECT'].includes(normalizedDecision)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid decision',
                validDecisions: ['APPROVE', 'REJECT'],
            });
        }

        const request = await ManualOverrideRequest.findByPk(id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Manual override request not found' });
        }
        if (request.status !== 'PENDING_APPROVAL') {
            return res.status(409).json({ success: false, error: 'Manual override request is already resolved' });
        }

        await request.update({
            status: normalizedDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            approved_by_admin_id: req.user.adminId,
            resolved_at: new Date(),
            resolution_notes: notes || null,
        });

        return res.json({
            success: true,
            data: {
                overrideRequestId: request.override_id,
                status: request.status,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to resolve manual override request', message: error.message });
    }
});

module.exports = router;
