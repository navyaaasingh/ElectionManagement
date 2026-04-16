const express = require('express');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { Voter, VotingRecord, Election } = require('../models/index.js');
const { sequelize } = require('../db/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const AuditLog = require('../models/auditLog.model.js');


const router = express.Router();
const getAdminScope = (req) => {
    if (req.user?.adminRole === 'SUPER_ADMIN') return {};
    if (req.user?.adminId) return { admin_id: req.user.adminId };
    return {};
};

/**
 * @route   POST /api/v1/voters/fingerprint/capture
 * @desc    Capture fingerprint hash for voter portal and store in DB
 * @access  Voter self or Admin
 */
router.post('/fingerprint/capture', authenticate, async (req, res) => {
    try {
        const {
            voterId,
            terminalId = 'TERM-WEB-001',
            fingerprintTemplate,
        } = req.body || {};

        if (!voterId) {
            return res.status(400).json({
                success: false,
                message: 'voterId is required',
            });
        }

        const isAdmin = req.user?.role === 'admin';
        const isSelf = req.user?.role === 'voter' && req.user?.voterId === voterId;

        if (!isAdmin && !isSelf) {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        const where = isAdmin
            ? { voter_id: voterId, ...getAdminScope(req) }
            : { voter_id: voterId };

        const voter = await Voter.findOne({ where });
        if (!voter) {
            return res.status(404).json({
                success: false,
                message: 'Voter not found',
            });
        }

        // Never persist raw fingerprint template. Persist only SHA-256 hash.
        const captureSource = String(fingerprintTemplate || '').trim()
            || `${voterId}:${terminalId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

        const fingerprintHash = crypto
            .createHash('sha256')
            .update(captureSource)
            .digest('hex');

        await voter.update({
            biometric_hash: fingerprintHash,
            is_biometric_registered: true,
            device_id: terminalId,
        });

        try {
            await AuditLog.create({
                event_type: 'FINGERPRINT_CAPTURED',
                user_id: voter.voter_id,
                metadata: {
                    terminal_id: terminalId,
                    hash_prefix: fingerprintHash.slice(0, 12),
                    captured_via: fingerprintTemplate ? 'template-input' : 'portal-auto-capture',
                },
            });
        } catch (auditError) {
            console.warn('Fingerprint capture audit write failed:', auditError.message);
        }

        return res.json({
            success: true,
            message: 'Fingerprint captured and stored',
            data: {
                voterId: voter.voter_id,
                terminalId,
                fingerprintCaptured: true,
                fingerprintHash,
                hashId: fingerprintHash.toUpperCase(),
                storage: 'voters.biometric_hash',
                capturedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Failed to capture fingerprint',
            error: error.message,
        });
    }
});

/**
 * @route   GET /api/v1/voters
 * @desc    Get all voters (paginated)
 * @access  Admin only
 */
router.get('/', authenticate, authorize('admin'), async (req, res) => {
    try {
        const {
            status,
            districtId,
            limit = 50,
            offset = 0,
            search,
        } = req.query;

        const where = { ...getAdminScope(req) };

        if (status) {
            where.status = status;
        }

        if (districtId) {
            where.district_id = districtId;
        }

        if (search) {
            where[Op.or] = [
                { aadhar_number: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone_number: { [Op.like]: `%${search}%` } },
            ];
        }

        const voters = await Voter.findAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['created_at', 'DESC']],
        });

        const total = await Voter.count({ where });

        res.json({
            success: true,
            voters,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
            },
        });
    } catch (error) {
        console.error('Error fetching voters:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voters',
            error: error.message,
        });
    }
});

/**
 * @route   GET /api/v1/voters/:voterId
 * @desc    Get voter details
 * @access  Admin or self
 */
router.get('/:voterId', authenticate, async (req, res) => {
    try {
        const { voterId } = req.params;

        // Check authorization (admin or self)
        if (req.user.role !== 'admin' && req.user.voterId !== voterId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        const voter = await Voter.findOne({
            where: req.user.role === 'admin'
                ? { voter_id: voterId, ...getAdminScope(req) }
                : { voter_id: voterId },
        });

        if (!voter) {
            return res.status(404).json({
                success: false,
                message: 'Voter not found',
            });
        }

        // Don't send biometric hash
        const voterData = voter.toJSON();
        delete voterData.biometric_hash;

        res.json({
            success: true,
            voter: voterData,
        });
    } catch (error) {
        console.error('Error fetching voter:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voter details',
            error: error.message,
        });
    }
});

/**
 * @route   PUT /api/v1/voters/:voterId
 * @desc    Update voter details
 * @access  Admin only
 */
router.put('/:voterId', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { voterId } = req.params;
        const {
            email,
            phoneNumber,
            districtId,
            status,
        } = req.body;

        const voter = await Voter.findOne({ where: { voter_id: voterId, ...getAdminScope(req) } });

        if (!voter) {
            return res.status(404).json({
                success: false,
                message: 'Voter not found',
            });
        }

        // Update allowed fields
        if (email) voter.email = email;
        if (phoneNumber) voter.phone_number = phoneNumber;
        if (districtId) voter.district_id = districtId;
        if (status) voter.status = status;

        await voter.save();

        // Log the update
        await AuditLog.create({
            eventType: 'VOTER_UPDATE',
            userId: req.user.voterId,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            success: true,
            metadata: {
                voterId,
                updatedFields: Object.keys(req.body),
            },
        });

        res.json({
            success: true,
            message: 'Voter updated successfully',
            voter: voter.toJSON(),
        });
    } catch (error) {
        console.error('Error updating voter:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update voter',
            error: error.message,
        });
    }
});

/**
 * @route   GET /api/v1/voters/:voterId/voting-history
 * @desc    Get voter's voting history
 * @access  Admin or self
 */
router.get('/:voterId/voting-history', authenticate, async (req, res) => {
    try {
        const { voterId } = req.params;

        // Check authorization
        if (req.user.role !== 'admin' && req.user.voterId !== voterId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        const votingHistory = await VotingRecord.findAll({
            where: { voter_id: voterId },
            include: [{
                model: Election,
                attributes: ['election_id', 'name', 'election_type', 'start_date', 'end_date'],
            }],
            order: [['voted_at', 'DESC']],
        });

        res.json({
            success: true,
            voterId,
            votingHistory,
            count: votingHistory.length,
        });
    } catch (error) {
        console.error('Error fetching voting history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voting history',
            error: error.message,
        });
    }
});

/**
 * @route   GET /api/v1/voters/stats/summary
 * @desc    Get voter statistics
 * @access  Admin only
 */
router.get('/stats/summary', authenticate, authorize('admin'), async (req, res) => {
    try {
        const scope = getAdminScope(req);
        const totalVoters = await Voter.count({ where: scope });
        const activeVoters = await Voter.count({ where: { ...scope, status: 'active' } });
        const blockedVoters = await Voter.count({ where: { ...scope, status: 'suspended' } });

        // Voters by district
        const votersByDistrict = await Voter.findAll({
            attributes: [
                'district_id',
                [sequelize.fn('COUNT', sequelize.col('voter_id')), 'count'],
            ],
            where: scope,
            group: ['district_id'],
        });

        res.json({
            success: true,
            stats: {
                total: totalVoters,
                active: activeVoters,
                blocked: blockedVoters,
                byDistrict: votersByDistrict,
            },
        });
    } catch (error) {
        console.error('Error fetching voter stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voter statistics',
            error: error.message,
        });
    }
});

module.exports = router;
