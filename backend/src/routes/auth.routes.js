const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Voter } = require('../models/index.js');
const { generateToken, verifyToken } = require('../middleware/auth.middleware.js');
const { authLimiter } = require('../middleware/rateLimit.middleware.js');
const logger = require('../utils/logger.js');


const router = express.Router();

/**
 * POST /api/v1/auth/register-voter
 * Register a new voter
 */
router.post('/register-voter', async (req, res) => {
    try {
        const {
            aadharNumber,
            fullName,
            biometricTemplate,
            districtId,
        } = req.body;

        logger.info('VOTER_REGISTRATION_ATTEMPT', {
            aadharNumber: aadharNumber ? aadharNumber.slice(-4) : 'unknown',
            ip: req.ip,
            timestamp: new Date().toISOString()
        });

        // Validate required fields
        if (!aadharNumber || !fullName || !biometricTemplate || !districtId) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['aadharNumber', 'fullName', 'biometricTemplate', 'districtId'],
            });
        }

        // Validate Aadhar number format (12 digits)
        if (!/^\d{12}$/.test(aadharNumber)) {
            return res.status(400).json({
                error: 'Invalid Aadhar number',
                message: 'Aadhar number must be exactly 12 digits',
            });
        }

        // Check if voter already exists
        const existingVoter = await Voter.findOne({
            where: { aadhar_number: aadharNumber },
        });

        if (existingVoter) {
            return res.status(409).json({
                error: 'Voter already registered',
                message: 'A voter with this Aadhar number already exists',
            });
        }

        // Hash the biometric template (SHA-256)
        // In production, this would be done on the IoT terminal
        const biometricHash = crypto
            .createHash('sha256')
            .update(biometricTemplate)
            .digest('hex');

        // Create voter record
        const voter = await Voter.create({
            aadhar_number: aadharNumber,
            full_name: fullName,
            biometric_hash: biometricHash,
            district_id: districtId,
            status: 'active',
        });

        res.status(201).json({
            success: true,
            message: 'Voter registered successfully',
            voter: {
                voterId: voter.voter_id,
                fullName: voter.full_name,
                districtId: voter.district_id,
                registrationDate: voter.registration_date,
            },
        });

    } catch (error) {
        console.error('Voter registration error:', error.message);

        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                error: 'Duplicate entry',
                message: 'Biometric data already registered',
            });
        }

        res.status(500).json({
            error: 'Registration failed',
            message: error.message,
        });
    }
});

/**
 * POST /api/v1/auth/biometric
 * Authenticate voter using biometric data
 */
router.post('/biometric', authLimiter, async (req, res) => {
    try {
        const { biometricTemplate, terminalId } = req.body;

        if (!biometricTemplate || !terminalId) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['biometricTemplate', 'terminalId'],
            });
        }

        // Hash the biometric template
        const biometricHash = crypto
            .createHash('sha256')
            .update(biometricTemplate)
            .digest('hex');

        // Find voter by biometric hash
        const voter = await Voter.findOne({
            where: { biometric_hash: biometricHash, status: 'active' },
        });

        if (!voter) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Biometric data not recognized',
            });
        }

        // Generate JWT token for the voting session
        const token = generateToken({
            voterId: voter.voter_id,
            districtId: voter.district_id,
            role: 'voter',
            terminalId,
        });

        res.json({
            success: true,
            message: 'Authentication successful',
            voter: {
                voterId: voter.voter_id,
                fullName: voter.full_name,
                districtId: voter.district_id,
                hasVoted: voter.has_voted,
            },
            token,
        });

    } catch (error) {
        console.error('Biometric auth error:', error.message);
        res.status(500).json({
            error: 'Authentication failed',
            message: error.message,
        });
    }
});

/**
 * POST /api/v1/auth/admin/login
 * Admin login with username and password
 */
router.post('/admin/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: 'Missing credentials',
                required: ['username', 'password'],
            });
        }

        // TODO: Implement admin user model and lookup
        // For now, using environment variable for demo
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (username !== adminUsername) {
            return res.status(401).json({
                error: 'Invalid credentials',
            });
        }

        // In production, use bcrypt.compare with hashed password from database
        const isValid = adminPasswordHash
            ? await bcrypt.compare(password, adminPasswordHash)
            : password === (process.env.ADMIN_PASSWORD || 'admin123'); // Demo only

        if (!isValid) {
            return res.status(401).json({
                error: 'Invalid credentials',
            });
        }

        // Generate admin token
        const token = generateToken({
            username,
            role: 'admin',
            permissions: ['manage_elections', 'manage_candidates', 'view_results', 'manage_voters'],
        });

        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            user: {
                username,
                role: 'admin',
            },
        });

    } catch (error) {
        console.error('Admin login error:', error.message);
        res.status(500).json({
            error: 'Login failed',
            message: error.message,
        });
    }
});

/**
 * GET /api/v1/auth/verify
 * Verify JWT token validity
 */
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                valid: false,
                error: 'No token provided',
            });
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token);

        res.json({
            valid: true,
            user: decoded,
        });

    } catch (error) {
        res.status(401).json({
            valid: false,
            error: error.message,
        });
    }
});

module.exports = router;
