const express = require('express');
const { sequelize } = require('../db/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const iotService = require('../services/iotService.js');
const AuditLog = require('../models/auditLog.model.js');
const { OutboxEvent, DeadLetterEvent } = require('../models/index.js');
const mlHealthService = require('../services/mlHealth.service.js');
const {
    voteVelocityPerDistrict,
    terminalOfflineCount,
    outboxPendingGauge,
    deadLetterPendingGauge,
} = require('../services/observability.service.js');
const { getQualifiedTableName } = require('../contexts/context.config.js');

const router = express.Router();
const DIALECT = sequelize.getDialect();
const VOTING_RECORDS_TABLE = getQualifiedTableName('voting_records', DIALECT);
const VOTERS_TABLE = getQualifiedTableName('voters', DIALECT);

router.get('/turnout', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const [rows] = await sequelize.query(`
            WITH registered AS (
                SELECT COALESCE(district_id::text, 'unknown') AS district_id,
                       COUNT(*)::int AS registered_voters
                FROM ${VOTERS_TABLE}
                GROUP BY district_id
            ),
            voted AS (
                SELECT COALESCE(v.district_id::text, 'unknown') AS district_id,
                       COUNT(*)::int AS votes_cast
                FROM ${VOTING_RECORDS_TABLE} vr
                JOIN ${VOTERS_TABLE} v ON v.voter_id = vr.voter_id
                GROUP BY v.district_id
            )
            SELECT r.district_id,
                   r.registered_voters,
                   COALESCE(v.votes_cast, 0)::int AS votes_cast,
                   ROUND((COALESCE(v.votes_cast, 0)::numeric / NULLIF(r.registered_voters, 0)::numeric) * 100, 2) AS turnout_pct
            FROM registered r
            LEFT JOIN voted v ON v.district_id = r.district_id
            ORDER BY turnout_pct DESC NULLS LAST, votes_cast DESC
        `);

        const totals = rows.reduce((acc, row) => {
            acc.registered += Number(row.registered_voters || 0);
            acc.voted += Number(row.votes_cast || 0);
            return acc;
        }, { registered: 0, voted: 0 });

        const turnoutPct = totals.registered > 0
            ? Number(((totals.voted / totals.registered) * 100).toFixed(2))
            : 0;

        res.json({
            success: true,
            turnout: {
                registeredVoters: totals.registered,
                votesCast: totals.voted,
                turnoutPct,
                byDistrict: rows,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch turnout metrics', message: error.message });
    }
});

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
        terminalOfflineCount.set(terminalHealth.offline);

        const terminalHeartbeatHeatmap = terminals.map((terminal) => {
            const lastSeenMs = terminal.lastSeen ? new Date(terminal.lastSeen).getTime() : 0;
            return {
                terminalId: terminal.terminalId,
                districtId: terminal.districtId || terminal.district || 'unknown',
                status: (lastSeenMs > 0 && (now - lastSeenMs <= onlineThresholdMs)) ? 'online' : 'offline',
                lastSeen: terminal.lastSeen || null,
                stalenessMs: lastSeenMs ? now - lastSeenMs : null,
            };
        });

        const [districtTurnout] = await sequelize.query(`
            SELECT COALESCE(v.district_id::text, 'unknown') AS district_id,
                   COUNT(*)::int AS votes
            FROM ${VOTING_RECORDS_TABLE} vr
            JOIN ${VOTERS_TABLE} v ON v.voter_id = vr.voter_id
            GROUP BY v.district_id
            ORDER BY votes DESC
        `);

        const [districtVelocity] = await sequelize.query(`
            WITH district_registered AS (
                SELECT COALESCE(district_id::text, 'unknown') AS district_id,
                       COUNT(*)::int AS eligible_voters
                FROM ${VOTERS_TABLE}
                GROUP BY district_id
            )
            SELECT COALESCE(v.district_id::text, 'unknown') AS district_id,
                   COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(vr.vote_timestamp))) / 3600.0, 1.0) AS votes_per_hour,
                   COUNT(*)::int AS total_votes,
                   COALESCE(dr.eligible_voters, 1)::int AS eligible_voters
            FROM ${VOTING_RECORDS_TABLE} vr
            JOIN ${VOTERS_TABLE} v ON v.voter_id = vr.voter_id
            LEFT JOIN district_registered dr ON dr.district_id = COALESCE(v.district_id::text, 'unknown')
            WHERE vr.vote_timestamp >= NOW() - INTERVAL '1 hour'
            GROUP BY v.district_id, dr.eligible_voters
            ORDER BY votes_per_hour DESC
        `);
        districtVelocity.forEach((row) => {
            voteVelocityPerDistrict.labels(String(row.district_id || 'unknown')).set(Number(row.votes_per_hour || 0));
        });

        const [terminalTurnout] = await sequelize.query(`
            SELECT COALESCE(vr.terminal_id::text, 'unknown') AS terminal_id,
                   COUNT(*)::int AS votes
            FROM ${VOTING_RECORDS_TABLE} vr
            GROUP BY vr.terminal_id
            ORDER BY votes DESC
        `);

        const anomalyAlerts = await AuditLog.find({
            $or: [
                { event_type: /fraud/i },
                { action: /fraud|anomaly|tamper|critical/i },
            ],
        }).sort({ timestamp: -1 }).limit(50).lean();

        const [outboxPending, deadLetterPending] = await Promise.all([
            OutboxEvent.count({ where: { status: 'PENDING' } }),
            DeadLetterEvent.count({ where: { resolved: false } }),
        ]);
        outboxPendingGauge.set(outboxPending);
        deadLetterPendingGauge.set(deadLetterPending);

        const criticalAlerts = [];
        const turnoutSpikeThresholdPct = Number(process.env.ALERT_TURNOUT_SPIKE_PCT_PER_HOUR || 20);
        const offlineTerminalThreshold = Number(process.env.ALERT_TERMINAL_OFFLINE_COUNT || 5);

        districtVelocity.forEach((row) => {
            const eligible = Number(row.eligible_voters || 1);
            const turnoutPctPerHour = (Number(row.total_votes || 0) / eligible) * 100;
            if (turnoutPctPerHour > turnoutSpikeThresholdPct) {
                criticalAlerts.push({
                    type: 'TURNOUT_SPIKE',
                    districtId: row.district_id,
                    turnoutPctPerHour: Number(turnoutPctPerHour.toFixed(2)),
                    thresholdPct: turnoutSpikeThresholdPct,
                });
            }
        });
        if (terminalHealth.offline > offlineTerminalThreshold) {
            criticalAlerts.push({
                type: 'TERMINAL_OFFLINE_SPIKE',
                offline: terminalHealth.offline,
                threshold: offlineTerminalThreshold,
            });
        }

        res.json({
            success: true,
            terminalHealth,
            terminalHeartbeatHeatmap,
            turnout: {
                byDistrict: districtTurnout,
                byTerminal: terminalTurnout,
                velocityByDistrict: districtVelocity,
            },
            anomalyAlerts,
            queueDepth: {
                outboxPending,
                deadLetterPending,
            },
            mlHealth: mlHealthService.getStatus(),
            criticalAlerts,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load operations dashboard', message: error.message });
    }
});

router.get('/ml-health', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const live = await mlHealthService.checkOnce();
        res.json({ success: true, mlHealth: live });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to check ML health', message: error.message });
    }
});

router.get('/rollout-policy', authenticate, authorize('admin', 'observer'), (req, res) => {
    res.json({
        success: true,
        canary: {
            districtTrafficPercent: Number(process.env.CANARY_DISTRICT_TRAFFIC_PERCENT || 10),
            strategy: 'Route selected district traffic to new version first',
        },
        rollbackCriteria: {
            p95LatencyMs: Number(process.env.ROLLBACK_P95_LATENCY_MS || 2000),
            errorRatePercent: Number(process.env.ROLLBACK_ERROR_RATE_PERCENT || 0.1),
        },
    });
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
