const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
    AdminUser,
    Election,
    PollingBooth,
    SupervisorAssignment,
    BoothSession,
    VoteAttempt,
    ManualOverrideRequest,
    BallotToken,
    CustodyEvent,
} = require('../models/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');

const router = express.Router();

const ACTIVE_ASSIGNMENT_STATUSES = ['ACTIVE'];
const ACTIVE_SESSION_STATUSES = ['ACTIVE', 'PAUSED'];

const canManageElection = (req, election) => {
    if (!election) return false;
    if (req.user?.adminRole === 'SUPER_ADMIN') return true;
    return req.user?.adminId && election.created_by_admin_id === req.user.adminId;
};

const canManageSession = (req, session) => {
    if (!session) return false;
    if (req.user?.role === 'admin') return true;
    return req.user?.role === 'supervisor' && req.user?.adminId === session.supervisor_admin_id;
};

const buildCustodyHash = ({ sessionId, eventType, actorAdminId, electionId, boothId, prevHash, payload }) => {
    const source = JSON.stringify({
        sessionId,
        eventType,
        actorAdminId,
        electionId,
        boothId,
        prevHash: prevHash || null,
        payload: payload || {},
        now: Date.now(),
    });
    return crypto.createHash('sha256').update(source).digest('hex');
};

const appendCustodyEvent = async ({ electionId, boothId, terminalId, actorAdminId, eventType, payload, sessionId }) => {
    const previous = await CustodyEvent.findOne({
        where: { election_id: electionId },
        order: [['created_at', 'DESC']],
    });
    const prevHash = previous?.event_hash || null;
    const eventHash = buildCustodyHash({
        sessionId,
        eventType,
        actorAdminId,
        electionId,
        boothId,
        prevHash,
        payload,
    });

    return CustodyEvent.create({
        election_id: electionId,
        booth_id: boothId || null,
        terminal_id: terminalId || null,
        actor_admin_id: actorAdminId || null,
        event_type: eventType,
        event_hash: eventHash,
        prev_event_hash: prevHash,
        payload: payload || {},
    });
};

/**
 * POST /api/v1/supervisor/assignments
 */
router.post('/assignments', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const {
            electionId,
            boothId,
            supervisorAdminId,
            startsAt,
            endsAt,
            notes,
        } = req.body || {};

        if (!electionId || !boothId || !supervisorAdminId || !startsAt || !endsAt) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['electionId', 'boothId', 'supervisorAdminId', 'startsAt', 'endsAt'],
            });
        }

        const [election, booth, supervisor] = await Promise.all([
            Election.findByPk(electionId),
            PollingBooth.findByPk(boothId),
            AdminUser.findOne({
                where: {
                    admin_id: supervisorAdminId,
                    role: 'SUPERVISOR',
                    is_active: true,
                },
            }),
        ]);

        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }
        if (!booth) {
            return res.status(404).json({ success: false, error: 'Polling booth not found' });
        }
        if (!supervisor) {
            return res.status(404).json({ success: false, error: 'Supervisor account not found or inactive' });
        }
        if (booth.election_id !== election.election_id) {
            return res.status(400).json({ success: false, error: 'Booth is not mapped to this election' });
        }
        if (!canManageElection(req, election)) {
            return res.status(403).json({ success: false, error: 'You can only manage your own elections' });
        }

        const start = new Date(startsAt);
        const end = new Date(endsAt);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            return res.status(400).json({ success: false, error: 'Invalid assignment window' });
        }

        const assignment = await SupervisorAssignment.create({
            election_id: electionId,
            booth_id: boothId,
            supervisor_admin_id: supervisorAdminId,
            assigned_by: req.user.adminId || null,
            assignment_start: start,
            assignment_end: end,
            status: 'ACTIVE',
            notes: notes || null,
        });

        return res.status(201).json({
            success: true,
            message: 'Supervisor assigned successfully',
            assignment,
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to assign supervisor', message: error.message });
    }
});

/**
 * POST /api/v1/supervisor/sessions/start
 */
router.post('/sessions/start', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const { electionId, boothId, terminalId } = req.body || {};
        if (!electionId || !boothId || !terminalId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['electionId', 'boothId', 'terminalId'],
            });
        }

        const [election, booth] = await Promise.all([
            Election.findByPk(electionId),
            PollingBooth.findByPk(boothId),
        ]);

        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });
        if (!booth) return res.status(404).json({ success: false, error: 'Polling booth not found' });
        if (booth.election_id !== election.election_id) {
            return res.status(400).json({ success: false, error: 'Booth is not mapped to this election' });
        }

        if (!['ACTIVE', 'READY_FOR_POLLING', 'ACTIVE_POLLING'].includes(election.status)) {
            return res.status(400).json({
                success: false,
                code: 'ELECTION_STATE_INVALID',
                error: `Election state ${election.status} does not allow session start`,
            });
        }

        const now = new Date();
        if (req.user.role === 'supervisor') {
            const assignment = await SupervisorAssignment.findOne({
                where: {
                    election_id: electionId,
                    booth_id: boothId,
                    supervisor_admin_id: req.user.adminId,
                    status: { [Op.in]: ACTIVE_ASSIGNMENT_STATUSES },
                    assignment_start: { [Op.lte]: now },
                    assignment_end: { [Op.gte]: now },
                },
            });
            if (!assignment) {
                return res.status(403).json({
                    success: false,
                    code: 'BOOTH_ASSIGNMENT_INVALID',
                    error: 'Supervisor is not assigned to this booth at current time window',
                });
            }
        } else if (!canManageElection(req, election)) {
            return res.status(403).json({ success: false, error: 'You can only manage your own elections' });
        }

        const existing = await BoothSession.findOne({
            where: {
                election_id: electionId,
                booth_id: boothId,
                status: { [Op.in]: ACTIVE_SESSION_STATUSES },
            },
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'An active session already exists for this booth',
                sessionId: existing.session_id,
            });
        }

        const supervisorAdminId = req.user.role === 'supervisor'
            ? req.user.adminId
            : (req.body.supervisorAdminId || req.user.adminId);

        const session = await BoothSession.create({
            election_id: electionId,
            booth_id: boothId,
            terminal_id: terminalId,
            supervisor_admin_id: supervisorAdminId,
            status: 'ACTIVE',
            start_reason_code: req.body.startReasonCode || 'POLLING_STARTED',
            notes: req.body.notes || null,
            metadata: req.body.metadata || {},
        });

        if (election.status === 'READY_FOR_POLLING') {
            await election.update({ status: 'ACTIVE_POLLING' });
        }

        await appendCustodyEvent({
            electionId,
            boothId,
            terminalId,
            actorAdminId: req.user.adminId,
            eventType: 'SESSION_STARTED',
            payload: {
                sessionId: session.session_id,
                startReasonCode: session.start_reason_code,
            },
            sessionId: session.session_id,
        });

        return res.status(201).json({
            success: true,
            message: 'Booth session started',
            session,
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to start booth session', message: error.message });
    }
});

/**
 * POST /api/v1/supervisor/sessions/:sessionId/pause
 */
router.post('/sessions/:sessionId/pause', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const reasonCode = req.body?.reasonCode || 'SECURITY_CHECK';

        const session = await BoothSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
        if (!canManageSession(req, session)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to pause this session' });
        }
        if (session.status !== 'ACTIVE') {
            return res.status(400).json({ success: false, error: 'Only ACTIVE sessions can be paused' });
        }

        await session.update({
            status: 'PAUSED',
            stop_reason_code: reasonCode,
        });

        await appendCustodyEvent({
            electionId: session.election_id,
            boothId: session.booth_id,
            terminalId: session.terminal_id,
            actorAdminId: req.user.adminId,
            eventType: 'SESSION_PAUSED',
            payload: { sessionId, reasonCode },
            sessionId,
        });

        return res.json({ success: true, message: 'Session paused', session });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to pause session', message: error.message });
    }
});

/**
 * POST /api/v1/supervisor/sessions/:sessionId/resume
 */
router.post('/sessions/:sessionId/resume', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const reasonCode = req.body?.reasonCode || 'ISSUE_RESOLVED';

        const session = await BoothSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
        if (!canManageSession(req, session)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to resume this session' });
        }
        if (session.status !== 'PAUSED') {
            return res.status(400).json({ success: false, error: 'Only PAUSED sessions can be resumed' });
        }

        await session.update({
            status: 'ACTIVE',
            stop_reason_code: reasonCode,
        });

        await appendCustodyEvent({
            electionId: session.election_id,
            boothId: session.booth_id,
            terminalId: session.terminal_id,
            actorAdminId: req.user.adminId,
            eventType: 'SESSION_RESUMED',
            payload: { sessionId, reasonCode },
            sessionId,
        });

        return res.json({ success: true, message: 'Session resumed', session });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to resume session', message: error.message });
    }
});

/**
 * POST /api/v1/supervisor/sessions/:sessionId/stop
 */
router.post('/sessions/:sessionId/stop', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const reasonCode = req.body?.reasonCode || 'POLLING_ENDED';

        const session = await BoothSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
        if (!canManageSession(req, session)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to stop this session' });
        }
        if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
            return res.status(400).json({ success: false, error: 'Session is already stopped' });
        }

        await session.update({
            status: 'STOPPED',
            stop_reason_code: reasonCode,
            ended_at: new Date(),
        });

        await appendCustodyEvent({
            electionId: session.election_id,
            boothId: session.booth_id,
            terminalId: session.terminal_id,
            actorAdminId: req.user.adminId,
            eventType: 'SESSION_STOPPED',
            payload: { sessionId, reasonCode },
            sessionId,
        });

        return res.json({ success: true, message: 'Session stopped', session });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to stop session', message: error.message });
    }
});

/**
 * GET /api/v1/supervisor/sessions/:sessionId/queue
 */
router.get('/sessions/:sessionId/queue', authenticate, authorize('admin', 'supervisor'), async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await BoothSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        if (!canManageSession(req, session)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to view this queue' });
        }

        const [attempts, pendingOverrides, activeTokens] = await Promise.all([
            VoteAttempt.findAll({
                where: { booth_session_id: sessionId },
                order: [['attempted_at', 'DESC']],
                limit: 100,
            }),
            ManualOverrideRequest.count({
                where: {
                    booth_session_id: sessionId,
                    status: 'PENDING_APPROVAL',
                },
            }),
            BallotToken.count({
                where: {
                    booth_session_id: sessionId,
                    status: 'ISSUED',
                },
            }),
        ]);

        const summary = attempts.reduce((acc, row) => {
            const key = `${row.attempt_type}:${row.outcome}`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        return res.json({
            success: true,
            session,
            pendingOverrides,
            activeTokens,
            summary,
            attempts,
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to fetch session queue', message: error.message });
    }
});

module.exports = router;
