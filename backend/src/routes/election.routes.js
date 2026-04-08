const express = require('express');
const { Election, Candidate, VotingRecord, PollApproval } = require('../models/index.js');
const iotService = require('../services/iotService.js');
const resultsService = require('../services/resultsService.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');
const { sequelize } = require('../db/index.js');
const logger = require('../utils/logger.js');

const router = express.Router();

const STATUS_MAP = {
    upcoming: 'PENDING',
    pending: 'PENDING',
    active: 'ACTIVE',
    completed: 'COMPLETED',
    cancelled: 'CANCELLED',
};

const REVERSE_STATUS_MAP = {
    PENDING: 'upcoming',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
};

const ELECTION_TYPE_MAP = {
    NATIONAL: 'NATIONAL',
    STATE: 'STATE',
    LOCAL: 'LOCAL',
    INSTITUTIONAL: 'INSTITUTIONAL',
    GENERAL: 'INSTITUTIONAL',
    CAMPUS: 'INSTITUTIONAL',
};

const normalizeStatusInput = (status) => {
    if (!status) return null;
    const normalized = STATUS_MAP[String(status).toLowerCase()];
    return normalized || null;
};

const toClientElection = (election) => {
    if (!election) return null;
    const data = election.toJSON ? election.toJSON() : election;
    return {
        ...data,
        election_name: data.name,
        status: REVERSE_STATUS_MAP[data.status] || String(data.status || '').toLowerCase(),
    };
};

const canAccessElection = (req, election) => {
    if (req.user?.adminRole === 'SUPER_ADMIN') return true;
    return !!(req.user?.adminId && election.created_by_admin_id === req.user.adminId);
};

const isTruthy = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const applyElectionStatusUpdate = async (election, requested) => {
    await election.update({ status: requested });

    if (requested === 'ACTIVE') {
        try {
            await iotService.broadcastActivation(election.election_id);
        } catch (error) {
            logger.warn('Failed to broadcast election activation', { electionId: election.election_id, error: error.message });
        }
    }

    if (requested === 'COMPLETED') {
        try {
            await resultsService.triggerTally(election.election_id);
        } catch (error) {
            logger.warn('Failed to trigger tally on completion', { electionId: election.election_id, error: error.message });
        }
    }
};

/**
 * GET /api/v1/elections
 */
router.get('/', async (req, res) => {
    try {
        const { status, type, limit = 50, offset = 0 } = req.query;

        const where = {};
        if (status) {
            const normalizedStatus = normalizeStatusInput(status) || status;
            where.status = normalizedStatus;
        }
        if (type) where.election_type = type;

        const elections = await Election.findAndCountAll({
            where,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            include: [{ model: Candidate, as: 'candidates' }],
            order: [['start_date', 'DESC']],
        });

        res.json({
            success: true,
            elections: elections.rows.map(toClientElection),
            total: elections.count,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to retrieve elections', message: error.message });
    }
});

/**
 * GET /api/v1/elections/current
 */
router.get('/current', async (req, res) => {
    try {
        const election = await Election.findOne({
            where: { status: 'ACTIVE' },
            include: [{ model: Candidate, as: 'candidates' }],
            order: [['start_date', 'DESC']],
        });

        if (!election) {
            return res.status(404).json({ success: false, error: 'No active election found' });
        }

        const out = toClientElection(election);
        res.json({
            success: true,
            id: out.election_id,
            name: out.election_name,
            date: out.start_date,
            status: out.status,
            election: out,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to retrieve current election', message: error.message });
    }
});

/**
 * GET /api/v1/elections/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const election = await Election.findByPk(req.params.id, {
            include: [{ model: Candidate, as: 'candidates' }],
        });

        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        const [statsRows] = await sequelize.query(
            `SELECT
                COUNT(*)::int AS total_votes,
                COUNT(DISTINCT voter_id)::int AS unique_voters
             FROM voting_records
             WHERE election_id = :electionId`,
            { replacements: { electionId: election.election_id } }
        );
        const stats = statsRows?.[0] || { total_votes: 0, unique_voters: 0 };

        res.json({
            success: true,
            election: toClientElection(election),
            statistics: {
                totalVotes: Number(stats.total_votes || 0),
                uniqueVoters: Number(stats.unique_voters || 0),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to retrieve election', message: error.message });
    }
});

/**
 * POST /api/v1/elections
 */
router.post('/', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const electionName = req.body.electionName || req.body.election_name || req.body.name;
        const electionType = req.body.electionType || req.body.election_type || req.body.type;
        const startDate = req.body.startDate || req.body.start_date;
        const endDate = req.body.endDate || req.body.end_date;
        const description = req.body.description || null;
        const normalizedType = ELECTION_TYPE_MAP[String(electionType || '').toUpperCase()] || null;

        if (!electionName || !electionType || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['electionName', 'electionType', 'startDate', 'endDate'],
            });
        }
        if (!normalizedType) {
            return res.status(400).json({
                success: false,
                error: 'Invalid election type',
                validElectionTypes: ['NATIONAL', 'STATE', 'LOCAL', 'INSTITUTIONAL'],
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({ success: false, error: 'Invalid date format' });
        }
        if (start >= end) {
            return res.status(400).json({ success: false, error: 'Start date must be before end date' });
        }

        const election = await Election.create({
            name: electionName,
            election_type: normalizedType,
            description,
            start_date: start,
            end_date: end,
            status: 'PENDING',
            created_by_admin_id: req.user.adminId || null,
        });

        res.status(201).json({
            success: true,
            message: 'Election created successfully',
            election: toClientElection(election),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create election', message: error.message });
    }
});

/**
 * PUT /api/v1/elections/:id
 */
router.put('/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const election = await Election.findByPk(req.params.id);
        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        if (!canAccessElection(req, election)) {
            return res.status(403).json({ success: false, error: 'You can only manage your own elections' });
        }

        if (['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(election.status)) {
            return res.status(403).json({
                success: false,
                error: `Cannot update election in ${election.status} status`,
            });
        }

        const updateData = {};
        if (req.body.electionName || req.body.election_name || req.body.name) {
            updateData.name = req.body.electionName || req.body.election_name || req.body.name;
        }
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.startDate || req.body.start_date) updateData.start_date = new Date(req.body.startDate || req.body.start_date);
        if (req.body.endDate || req.body.end_date) updateData.end_date = new Date(req.body.endDate || req.body.end_date);

        if (updateData.start_date && updateData.end_date && updateData.start_date >= updateData.end_date) {
            return res.status(400).json({ success: false, error: 'End date must be after start date' });
        }

        await election.update(updateData);
        res.json({ success: true, message: 'Election updated successfully', election: toClientElection(election) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update election', message: error.message });
    }
});

/**
 * DELETE /api/v1/elections/:id
 */
router.delete('/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const election = await Election.findByPk(req.params.id);
        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        if (!canAccessElection(req, election)) {
            return res.status(403).json({ success: false, error: 'You can only delete your own elections' });
        }

        if (election.status !== 'PENDING') {
            return res.status(403).json({
                success: false,
                error: 'Can only delete upcoming elections. Use cancel for active elections.',
            });
        }

        const voteCount = await VotingRecord.count({ where: { election_id: election.election_id } });
        if (voteCount > 0) {
            return res.status(403).json({ success: false, error: 'Cannot delete election with existing votes' });
        }

        await Candidate.destroy({ where: { election_id: election.election_id } });
        await election.destroy();
        res.json({ success: true, message: 'Election deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete election', message: error.message });
    }
});

/**
 * PUT /api/v1/elections/:id/status
 */
router.put('/:id/status', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const requested = normalizeStatusInput(req.body.status);
        if (!requested) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status',
                validStatuses: ['upcoming', 'active', 'completed', 'cancelled'],
            });
        }

        const election = await Election.findByPk(req.params.id);
        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        if (!canAccessElection(req, election)) {
            return res.status(403).json({ success: false, error: 'You can only update your own elections' });
        }

        const validTransitions = {
            PENDING: ['ACTIVE', 'CANCELLED'],
            ACTIVE: ['COMPLETED', 'CANCELLED'],
            COMPLETED: [],
            CANCELLED: [],
        };

        if (!validTransitions[election.status].includes(requested)) {
            return res.status(400).json({
                success: false,
                error: `Cannot transition from ${election.status} to ${requested}`,
                validTransitions: validTransitions[election.status].map((s) => REVERSE_STATUS_MAP[s]),
            });
        }

        const enforceMultiParty = isTruthy(process.env.ENFORCE_MULTI_PARTY_APPROVAL, process.env.NODE_ENV === 'production');
        if (enforceMultiParty && req.user.adminRole !== 'SUPER_ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Direct poll status change disabled. Create approval proposal first.',
                next: `/api/v1/elections/${election.election_id}/status/propose`,
            });
        }

        await applyElectionStatusUpdate(election, requested);

        res.json({
            success: true,
            message: `Election status updated to ${REVERSE_STATUS_MAP[requested]}`,
            election: toClientElection(election),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update status', message: error.message });
    }
});

/**
 * POST /api/v1/elections/:id/status/propose
 * Multi-party proposal for open/close/cancel poll transitions
 */
router.post('/:id/status/propose', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const requested = normalizeStatusInput(req.body.status);
        const notes = req.body.notes || null;
        const requiredApprovals = Number(req.body.requiredApprovals || process.env.POLL_REQUIRED_APPROVALS || 2);

        if (!requested || !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(requested)) {
            return res.status(400).json({ success: false, error: 'Invalid proposed status' });
        }

        const election = await Election.findByPk(req.params.id);
        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });
        if (!canAccessElection(req, election)) {
            return res.status(403).json({ success: false, error: 'You can only propose changes for your own elections' });
        }

        const proposal = await PollApproval.create({
            election_id: election.election_id,
            requested_status: requested,
            requested_by_admin_id: req.user.adminId,
            approver_admin_ids: [req.user.adminId],
            required_approvals: Math.max(2, requiredApprovals),
            status: 'PENDING',
            notes,
        });

        res.status(201).json({
            success: true,
            proposal,
            message: `Proposal created. ${proposal.required_approvals - 1} more approval(s) required.`,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create proposal', message: error.message });
    }
});

/**
 * GET /api/v1/elections/:id/status/proposals
 */
router.get('/:id/status/proposals', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const proposals = await PollApproval.findAll({
            where: { election_id: req.params.id },
            order: [['created_at', 'DESC']],
        });
        res.json({ success: true, proposals });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch proposals', message: error.message });
    }
});

/**
 * POST /api/v1/elections/:id/status/proposals/:proposalId/approve
 */
router.post('/:id/status/proposals/:proposalId/approve', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const election = await Election.findByPk(req.params.id);
        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });
        if (!canAccessElection(req, election)) {
            return res.status(403).json({ success: false, error: 'You can only approve changes for your own elections' });
        }

        const proposal = await PollApproval.findOne({
            where: {
                approval_id: req.params.proposalId,
                election_id: election.election_id,
                status: 'PENDING',
            },
        });
        if (!proposal) {
            return res.status(404).json({ success: false, error: 'Pending proposal not found' });
        }

        const approvers = Array.isArray(proposal.approver_admin_ids) ? proposal.approver_admin_ids : [];
        if (!approvers.includes(req.user.adminId)) {
            approvers.push(req.user.adminId);
        }

        const reached = approvers.length >= proposal.required_approvals;
        proposal.approver_admin_ids = approvers;
        proposal.status = reached ? 'APPROVED' : 'PENDING';
        await proposal.save();

        if (reached) {
            await applyElectionStatusUpdate(election, proposal.requested_status);
        }

        res.json({
            success: true,
            proposal,
            election: toClientElection(election),
            message: reached
                ? `Status updated to ${REVERSE_STATUS_MAP[proposal.requested_status]} after multi-party approval`
                : `Approval recorded (${approvers.length}/${proposal.required_approvals})`,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to approve proposal', message: error.message });
    }
});

module.exports = router;
