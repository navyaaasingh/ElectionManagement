const express = require('express');
const AuditLog = require('../models/auditLog.model.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const logger = require('../utils/logger.js');
const router = express.Router();

/**
 * @route   GET /api/v1/audit
 * @desc    Get audit logs with filters
 * @access  Admin only
 */
router.get('/', authenticate, authorize(['admin', 'observer']), async (req, res) => {
    try {
        const {
            eventType,
            userId,
            startDate,
            endDate,
            limit = 100,
            skip = 0,
        } = req.query;

        // Build query
        const query = {};

        if (eventType) {
            query.eventType = eventType;
        }

        if (userId) {
            query.userId = userId;
        }

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        // Execute query with pagination
        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .lean();

        const total = await AuditLog.countDocuments(query);

        res.json({
            success: true,
            logs,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: total > (parseInt(skip) + parseInt(limit)),
            },
        });
    } catch (error) {
        logger.error('Error fetching audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch audit logs',
            error: error.message,
        });
    }
});

/**
 * @route   GET /api/v1/audit/stats
 * @desc    Get audit log statistics
 * @access  Admin only
 */
router.get('/stats', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchStage = {};
        if (startDate || endDate) {
            matchStage.timestamp = {};
            if (startDate) matchStage.timestamp.$gte = new Date(startDate);
            if (endDate) matchStage.timestamp.$lte = new Date(endDate);
        }

        // Aggregate statistics
        const stats = await AuditLog.aggregate([
            ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
            {
                $group: {
                    _id: '$eventType',
                    count: { $sum: 1 },
                    successCount: {
                        $sum: { $cond: [{ $eq: ['$success', true] }, 1, 0] },
                    },
                    failureCount: {
                        $sum: { $cond: [{ $eq: ['$success', false] }, 1, 0] },
                    },
                },
            },
            {
                $project: {
                    eventType: '$_id',
                    count: 1,
                    successCount: 1,
                    failureCount: 1,
                    successRate: {
                        $multiply: [
                            { $divide: ['$successCount', '$count'] },
                            100,
                        ],
                    },
                },
            },
        ]);

        res.json({
            success: true,
            stats,
        });
    } catch (error) {
        logger.error('Error fetching audit stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch audit statistics',
            error: error.message,
        });
    }
});

/**
 * @route   GET /api/v1/audit/voter/:voterId
 * @desc    Get audit logs for specific voter
 * @access  Admin only
 */
router.get('/voter/:voterId', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { voterId } = req.params;

        const logs = await AuditLog.find({
            $or: [
                { userId: voterId },
                { 'metadata.voterId': voterId },
            ],
        })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();

        res.json({
            success: true,
            voterId,
            logs,
            count: logs.length,
        });
    } catch (error) {
        logger.error('Error fetching voter audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voter audit logs',
            error: error.message,
        });
    }
});

/**
 * @route   POST /api/v1/audit
 * @desc    Create audit log entry (internal use)
 * @access  Private (system only)
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const {
            eventType,
            userId,
            ipAddress,
            userAgent,
            success,
            metadata,
            errorMessage,
        } = req.body;

        const auditLog = await AuditLog.create({
            eventType,
            userId,
            ipAddress: ipAddress || req.ip,
            userAgent: userAgent || req.get('user-agent'),
            success,
            metadata,
            errorMessage,
        });

        res.status(201).json({
            success: true,
            message: 'Audit log created',
            logId: auditLog._id,
        });
    } catch (error) {
        logger.error('Error creating audit log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create audit log',
            error: error.message,
        });
    }
});

/**
 * @route   POST /api/v1/audit/alerts
 * @desc    Receive fraud alert from ML Kafka consumer and broadcast via WebSocket
 * @access  Internal (ML service) — validated by ML_SERVICE_API_KEY header
 */
router.post('/alerts', async (req, res) => {
    // 1. Internal API Key validation
    const internalKey = req.headers['x-ml-api-key'];
    const expectedKey = process.env.ML_SERVICE_API_KEY || 'ml-internal-secret';
    
    if (internalKey !== expectedKey) {
        logger.warn('Unauthorized ML alert attempt rejected from IP:', req.ip);
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        const {
            alertType,
            severity,
            voteId,
            voterId,
            terminalId,
            district,
            electionId,
            reason,
            confidence,
            anomalyScore,
            detectedAt,
        } = req.body;

        logger.warn(`🚨 Incoming Fraud Alert: Voter=${voterId} | Severity=${severity} | Conf=${confidence}`);

        // 2. Persist as audit log in MongoDB (Async/Failable in dev)
        let auditLogId = `LOCAL_${Date.now()}`;
        try {
            const auditLog = await AuditLog.create({
                event_type: 'fraud_alert',
                user_id: voterId || 'ml-service',
                terminal_id: terminalId,
                election_id: electionId,
                action: alertType || 'FRAUD_DETECTED',
                ip_address: req.ip,
                user_agent: 'ml-kafka-consumer',
                status: 'failure',
                details: {
                    voteId,
                    district,
                    reason,
                    confidence,
                    anomalyScore,
                    detectedAt,
                },
                error_message: reason,
            });
            auditLogId = auditLog._id;
        } catch (dbErr) {
            logger.warn('⚠️  Could not persist alert to MongoDB:', dbErr.message);
            // We continue anyway to ensure the real-time dashboard gets the signal
        }

        // 3. Broadcast alert to all connected WebSocket clients (dashboards)
        try {
            const { broadcastMessage } = require('../services/websocket.service.js');
            broadcastMessage('FRAUD_ALERT', {
                alertId: auditLogId,
                severity: severity || 'MEDIUM',
                alertType: alertType || 'FRAUD_DETECTED',
                voterId,
                terminalId,
                district,
                electionId,
                reason,
                confidence,
                anomalyScore,
                detectedAt: detectedAt || new Date().toISOString(),
            });
        } catch (wsErr) {
            logger.warn('WebSocket broadcast for alert failed:', wsErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'Alert broadcasted',
            alertId: auditLogId,
        });
    } catch (error) {
        logger.error('Error recording fraud alert:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record alert',
            error: error.message,
        });
    }
});

module.exports = router;

