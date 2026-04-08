const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const iotService = require('../services/iotService.js');
const { OutboxEvent } = require('../models/index.js');
const AuditLog = require('../models/auditLog.model.js');

const router = express.Router();

router.get('/status', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const terminals = iotService.getTerminals();
        const now = Date.now();
        const onlineThresholdMs = Number(process.env.TERMINAL_ONLINE_WINDOW_MS || 60 * 1000);
        const offlineVotesQueued = await OutboxEvent.count({ where: { status: 'PENDING', event_type: 'VOTE_SYNC_TO_BLOCKCHAIN' } });

        const data = terminals.map((terminal) => {
            const lastSeenMs = terminal.lastSeen ? new Date(terminal.lastSeen).getTime() : 0;
            const isOnline = lastSeenMs > 0 && (now - lastSeenMs <= onlineThresholdMs);
            return {
                terminalId: terminal.terminalId,
                districtId: terminal.districtId || terminal.district || 'unknown',
                status: isOnline ? 'online' : 'offline',
                queueLength: Number(terminal.queueLength || terminal.queue_length || 0),
                battery: terminal.battery ?? null,
                temperature: terminal.temperature ?? null,
                lastSeen: terminal.lastSeen || null,
            };
        });

        const sosEvents = await AuditLog.find({ event_type: 'SOS_ALERT' })
            .sort({ timestamp: -1 })
            .limit(20)
            .lean();

        return res.json({
            success: true,
            summary: {
                total: data.length,
                online: data.filter((t) => t.status === 'online').length,
                offline: data.filter((t) => t.status === 'offline').length,
                queuedVotes: offlineVotesQueued,
            },
            terminals: data,
            sos: sosEvents,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to load terminal status', message: error.message });
    }
});

module.exports = router;
