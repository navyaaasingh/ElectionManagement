const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { CustodyEvent, Election } = require('../models/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');

const router = express.Router();

const ALLOWED_CUSTODY_EVENTS = new Set([
    'DEVICE_HANDOVER',
    'DEVICE_SEAL_APPLIED',
    'DEVICE_SEAL_BROKEN',
    'SESSION_STARTED',
    'SESSION_PAUSED',
    'SESSION_RESUMED',
    'SESSION_STOPPED',
    'INCIDENT_REPORTED',
    'OVERRIDE_APPROVED',
    'OVERRIDE_REJECTED',
    'TAMPER_ALERT',
]);

const buildHash = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const canManageElection = (req, election) => {
    if (!election) return false;
    if (req.user?.adminRole === 'SUPER_ADMIN') return true;
    return req.user?.adminId && election.created_by_admin_id === req.user.adminId;
};

/**
 * GET /api/v1/custody/events
 */
router.get('/events', authenticate, authorize('admin', 'auditor'), async (req, res) => {
    try {
        const {
            electionId,
            boothId,
            terminalId,
            limit = 200,
            from,
            to,
        } = req.query;

        const where = {};
        if (electionId) where.election_id = electionId;
        if (boothId) where.booth_id = boothId;
        if (terminalId) where.terminal_id = terminalId;

        if (req.user.role === 'admin' && req.user.adminRole !== 'SUPER_ADMIN') {
            if (!electionId) {
                return res.status(400).json({
                    success: false,
                    error: 'electionId is required for scoped admin access',
                });
            }
            const election = await Election.findByPk(electionId);
            if (!canManageElection(req, election)) {
                return res.status(403).json({ success: false, error: 'Not authorized to view custody events for this election' });
            }
        }

        if (from || to) {
            where.created_at = {};
            if (from) where.created_at[Op.gte] = new Date(from);
            if (to) where.created_at[Op.lte] = new Date(to);
        }

        const events = await CustodyEvent.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: Math.min(parseInt(limit, 10) || 200, 1000),
        });

        return res.json({
            success: true,
            data: { events },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to fetch custody events', message: error.message });
    }
});

/**
 * POST /api/v1/custody/events
 */
router.post('/events', authenticate, authorize('admin', 'supervisor'), csrfProtection, async (req, res) => {
    try {
        const {
            electionId,
            boothId,
            terminalId,
            eventType,
            payload,
        } = req.body || {};

        if (!electionId || !eventType) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['electionId', 'eventType'],
            });
        }

        if (!ALLOWED_CUSTODY_EVENTS.has(eventType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid custody event type',
                validEventTypes: Array.from(ALLOWED_CUSTODY_EVENTS),
            });
        }

        if (req.user.role === 'admin' && req.user.adminRole !== 'SUPER_ADMIN') {
            const election = await Election.findByPk(electionId);
            if (!canManageElection(req, election)) {
                return res.status(403).json({ success: false, error: 'Not authorized to create custody events for this election' });
            }
        }

        const previous = await CustodyEvent.findOne({
            where: { election_id: electionId },
            order: [['created_at', 'DESC']],
        });

        const prevHash = previous?.event_hash || null;
        const eventHash = buildHash({
            electionId,
            boothId,
            terminalId,
            eventType,
            actorAdminId: req.user.adminId || null,
            payload: payload || {},
            prevHash,
            now: Date.now(),
        });

        const event = await CustodyEvent.create({
            election_id: electionId,
            booth_id: boothId || null,
            terminal_id: terminalId || null,
            actor_admin_id: req.user.adminId || null,
            event_type: eventType,
            event_hash: eventHash,
            prev_event_hash: prevHash,
            payload: payload || {},
        });

        return res.status(201).json({
            success: true,
            data: {
                eventId: event.custody_event_id,
                eventHash: event.event_hash,
                prevEventHash: event.prev_event_hash,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to create custody event', message: error.message });
    }
});

module.exports = router;
