const express = require('express');
const { sequelize } = require('../db/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const iotService = require('../services/iotService.js');
const AuditLog = require('../models/auditLog.model.js');

const router = express.Router();

router.get('/dashboard', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const terminals = iotService.getTerminals();
        const now = Date.now();
        const onlineThresholdMs = Number(process.env.TERMINAL_ONLINE_WINDOW_MS || 60 * 1000);

        const terminalHealth = terminals.reduce((acc, terminal) => {
            const lastSeenMs = terminal.lastSeen ? new Date(terminal.lastSeen).getTime() : 0;
            const isOnline = lastSeenMs > 0 && (now - lastSeenMs <= onlineThresholdMs);
            if (isOnline) acc.online += 1;
            else acc.offline += 1;
            return acc;
        }, { online: 0, offline: 0, total: terminals.length });

        const [districtTurnout] = await sequelize.query(`
            SELECT COALESCE(v.district_id::text, 'unknown') AS district_id,
                   COUNT(*)::int AS votes
            FROM voting_records vr
            JOIN voters v ON v.voter_id = vr.voter_id
            GROUP BY v.district_id
            ORDER BY votes DESC
        `);

        const [terminalTurnout] = await sequelize.query(`
            SELECT COALESCE(vr.terminal_id::text, 'unknown') AS terminal_id,
                   COUNT(*)::int AS votes
            FROM voting_records vr
            GROUP BY vr.terminal_id
            ORDER BY votes DESC
        `);

        const anomalyAlerts = await AuditLog.find({
            $or: [
                { event_type: /fraud/i },
                { action: /fraud|anomaly|tamper|critical/i },
            ],
        }).sort({ timestamp: -1 }).limit(50).lean();

        res.json({
            success: true,
            terminalHealth,
            turnout: {
                byDistrict: districtTurnout,
                byTerminal: terminalTurnout,
            },
            anomalyAlerts,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load operations dashboard', message: error.message });
    }
});

router.get('/audit/export', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const { eventType, startDate, endDate, limit = 1000 } = req.query;
        const query = {};
        if (eventType) query.event_type = eventType;
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(parseInt(limit, 10)).lean();
        const rows = logs.map((log) => {
            const event = (log.event_type || '').replace(/"/g, '""');
            const action = (log.action || '').replace(/"/g, '""');
            const user = (log.user_id || log.admin_id || '').replace(/"/g, '""');
            const ts = log.timestamp ? new Date(log.timestamp).toISOString() : '';
            const details = JSON.stringify(log.details || {}).replace(/"/g, '""');
            return `"${ts}","${event}","${action}","${user}","${details}"`;
        });

        const csv = `timestamp,event_type,action,user_id,details\n${rows.join('\n')}`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit_export_${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to export audit logs', message: error.message });
    }
});

router.post('/simulate', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const {
            registeredVoters = 1000,
            expectedTurnoutPct = 60,
            terminals = 10,
            avgVoteSeconds = 45,
            anomalyRatePct = 1.5,
        } = req.body || {};

        const projectedVotes = Math.round((Number(registeredVoters) * Number(expectedTurnoutPct)) / 100);
        const totalVotingSeconds = projectedVotes * Number(avgVoteSeconds);
        const capacityPerHour = Math.max(1, Math.floor((3600 / Number(avgVoteSeconds)) * Number(terminals)));
        const hoursNeeded = Number((totalVotingSeconds / (3600 * Number(terminals))).toFixed(2));
        const projectedAnomalies = Math.round((projectedVotes * Number(anomalyRatePct)) / 100);

        res.json({
            success: true,
            simulation: {
                projectedVotes,
                capacityPerHour,
                estimatedHoursRequired: hoursNeeded,
                projectedAnomalies,
                suggestedTerminals: Math.max(1, Math.ceil(projectedVotes / (8 * capacityPerHour))), // 8-hour poll window
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Simulation failed', message: error.message });
    }
});

module.exports = router;
