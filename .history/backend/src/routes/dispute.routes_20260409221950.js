const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');
const disputeService = require('../services/disputeService.js');

const router = express.Router();

const toPublicDispute = (dispute) => ({
    disputeId: dispute.dispute_id,
    electionId: dispute.election_id,
    districtId: dispute.district_id,
    filedBy: dispute.filed_by,
    reason: dispute.reason,
    status: dispute.status,
    filedAt: dispute.filed_at,
    challenge: dispute.challenge,
    review: dispute.review,
    adjudication: dispute.adjudication,
    events: dispute.events,
    blockchainEvidence: dispute.blockchain_evidence,
    recountResults: dispute.recount_results,
});

router.post('/', authenticate, authorize('admin', 'observer'), csrfProtection, async (req, res) => {
    try {
        const { electionId, districtId, reason, evidenceDescription, evidenceFiles } = req.body || {};

        if (!electionId || !districtId || !reason) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['electionId', 'districtId', 'reason'],
            });
        }

        const filedBy = req.user.adminId || req.user.voterId || req.user.username || 'system';
        const dispute = await disputeService.fileDispute({
            election_id: electionId,
            district_id: districtId,
            filed_by: String(filedBy),
            reason,
            evidence_description: evidenceDescription || null,
            evidence_files: Array.isArray(evidenceFiles) ? evidenceFiles : [],
            challenge: {
                submitted_by: String(filedBy),
                summary: reason,
            },
        });

        return res.status(201).json({ success: true, dispute: toPublicDispute(dispute) });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to file dispute', message: error.message });
    }
});

router.post('/:disputeId/challenge', authenticate, authorize('admin', 'observer'), csrfProtection, async (req, res) => {
    try {
        const { disputeId } = req.params;
        const { summary, evidenceFiles } = req.body || {};
        const actor = req.user.adminId || req.user.voterId || req.user.username || 'system';

        const dispute = await disputeService.updateChallenge(disputeId, {
            submitted_by: String(actor),
            summary: summary || 'Challenge submitted',
            evidence_files: Array.isArray(evidenceFiles) ? evidenceFiles : [],
        });

        return res.json({ success: true, dispute: toPublicDispute(dispute) });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/:disputeId/review', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { disputeId } = req.params;
        const { outcome, notes } = req.body || {};
        if (!['accept', 'reject', 'needs_evidence'].includes(String(outcome || '').toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid review outcome',
                validOutcomes: ['accept', 'reject', 'needs_evidence'],
            });
        }

        const dispute = await disputeService.updateReview(disputeId, {
            reviewed_by: String(req.user.adminId || req.user.username || 'admin'),
            outcome: String(outcome).toLowerCase(),
            notes: notes || null,
        });

        return res.json({ success: true, dispute: toPublicDispute(dispute) });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/:disputeId/adjudicate', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { disputeId } = req.params;
        const { decision, remedy } = req.body || {};
        if (!['upheld', 'dismissed', 'partial_relief'].includes(String(decision || '').toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid adjudication decision',
                validDecisions: ['upheld', 'dismissed', 'partial_relief'],
            });
        }

        const dispute = await disputeService.adjudicate(disputeId, {
            adjudicated_by: String(req.user.adminId || req.user.username || 'admin'),
            decision: String(decision).toLowerCase(),
            remedy: remedy || null,
        });

        return res.json({ success: true, dispute: toPublicDispute(dispute) });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/:disputeId/evidence', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const evidence = await disputeService.collectBlockchainEvidence(req.params.disputeId);
        return res.json({ success: true, evidence });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/:disputeId/recount', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const result = await disputeService.triggerRecount(
            req.params.disputeId,
            String(req.user.adminId || req.user.username || 'admin')
        );
        return res.json({ success: true, result });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;