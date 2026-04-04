const express = require('express');
const bcrypt = require('bcryptjs');
const { 
    generateRegistrationOptions, 
    verifyRegistrationResponse, 
    generateAuthenticationOptions, 
    verifyAuthenticationResponse 
} = require('@simplewebauthn/server');
const { Voter, Student, VoterPasskey } = require('../models/index.js');
const { generateToken, verifyToken } = require('../middleware/auth.middleware.js');
const { authLimiter } = require('../middleware/rateLimit.middleware.js');
const logger = require('../utils/logger.js');

const router = express.Router();

// WebAuthn configuration
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = 'CampusVote';
const ORIGIN = process.env.ORIGIN || 'http://localhost:3001';

/**
 * POST /api/v1/auth/login-email
 * Voter login with email and password
 */
router.post('/login-email', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // 1. Check if voter exists
        const voter = await Voter.findOne({ where: { email } });

        if (!voter) {
            // 2. Check if student exists (Self-service signup check)
            const student = await Student.findOne({ where: { email } });
            if (student) {
                return res.status(404).json({
                    error: 'Voter record not found',
                    code: 'VOTER_NOT_FOUND_STUDENT_EXISTS',
                    message: 'Student record found. Please complete your voter registration.',
                    student: {
                        name: student.name,
                        rollNumber: student.roll_number,
                        email: student.email
                    }
                });
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 3. Verify password
        const isValid = await bcrypt.compare(password, voter.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 4. Check status
        if (!voter.is_approved) {
            return res.status(403).json({
                error: 'Account pending approval',
                code: 'APPROVAL_PENDING',
                message: 'Your voter registration is being reviewed by the admin.'
            });
        }

        // 5. Generate token
        const token = generateToken({
            voterId: voter.voter_id,
            role: 'voter',
            status: voter.status
        });

        res.json({
            success: true,
            user: {
                voterId: voter.voter_id,
                fullName: voter.full_name,
                isBiometricRegistered: voter.is_biometric_registered
            },
            token
        });

    } catch (error) {
        logger.error('EMAIL_LOGIN_ERROR', { error: error.message });
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/v1/auth/signup-voter
 * Self-service signup for students
 */
router.post('/signup-voter', authLimiter, async (req, res) => {
    try {
        const { rollNumber, email, password, fullName, aadharNumber, districtId } = req.body;

        // Verify student record first
        const student = await Student.findOne({ where: { roll_number: rollNumber, email } });
        if (!student) {
            return res.status(403).json({ error: 'Institutional record validation failed' });
        }

        // Check if already registered
        const existingVoter = await Voter.findOne({ where: { email } });
        if (existingVoter) {
            return res.status(409).json({ error: 'Voter already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const voter = await Voter.create({
            roll_number: rollNumber,
            email,
            password: hashedPassword,
            full_name: fullName || student.name,
            aadhar_number: aadharNumber,
            district_id: districtId,
            status: 'pending',
            is_approved: false
        });

        res.status(201).json({
            success: true,
            message: 'Registration submitted for admin review',
            voterId: voter.voter_id
        });

    } catch (error) {
        logger.error('VOTER_SIGNUP_ERROR', { error: error.message });
        res.status(500).json({ error: 'Signup failed' });
    }
});

/**
 * POST /api/v1/auth/aadhaar-verify
 * Mock Aadhaar identity verification
 */
router.post('/aadhaar-verify', async (req, res) => {
    const { aadharNumber } = req.body;
    if (!/^\d{12}$/.test(aadharNumber)) {
        return res.status(400).json({ error: 'Invalid Aadhaar format' });
    }

    // Mock verification delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    res.json({
        success: true,
        message: 'Aadhaar identity verified successfully',
        data: {
            name: 'Verified User',
            isEligible: true
        }
    });
});

/**
 * WebAuthn (Passkey) Routes
 */

// Temporarily store challenges in memory (use Redis/Session in production)
const challenges = new Map();

router.post('/passkey/register-options', async (req, res) => {
    const { voterId } = req.body;
    const voter = await Voter.findByPk(voterId);
    if (!voter) return res.status(404).json({ error: 'Voter not found' });

    const userPasskeys = await VoterPasskey.findAll({ where: { voter_id: voterId } });

    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: voterId,
        userName: voter.email,
        attestationType: 'none',
        excludeCredentials: userPasskeys.map(pk => ({
            id: pk.credential_id,
            type: 'public-key',
            transports: pk.transports ? JSON.parse(pk.transports) : [],
        })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
        },
    });

    challenges.set(voterId, options.challenge);

    res.json(options);
});

router.post('/passkey/verify-registration', async (req, res) => {
    const { voterId, body } = req.body;
    const expectedChallenge = challenges.get(voterId);

    try {
        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            await VoterPasskey.create({
                voter_id: voterId,
                credential_id: registrationInfo.credentialID,
                public_key: registrationInfo.credentialPublicKey,
                counter: registrationInfo.counter,
                transports: JSON.stringify(body.response.transports || []),
            });

            await Voter.update({ is_biometric_registered: true }, { where: { voter_id: voterId } });

            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        challenges.delete(voterId);
    }
});

router.post('/passkey/login-options', async (req, res) => {
    const { email } = req.body;
    const voter = await Voter.findOne({ where: { email } });
    if (!voter) return res.status(404).json({ error: 'Voter not found' });

    const userPasskeys = await VoterPasskey.findAll({ where: { voter_id: voter.voter_id } });

    const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: userPasskeys.map(pk => ({
            id: pk.credential_id,
            type: 'public-key',
            transports: pk.transports ? JSON.parse(pk.transports) : [],
        })),
        userVerification: 'preferred',
    });

    challenges.set(voter.voter_id, options.challenge);

    res.json(options);
});

router.post('/passkey/verify-authentication', async (req, res) => {
    const { email, body } = req.body;
    const voter = await Voter.findOne({ where: { email } });
    if (!voter) return res.status(404).json({ error: 'Voter not found' });

    const passkey = await VoterPasskey.findOne({ 
        where: { voter_id: voter.voter_id, credential_id: body.id } 
    });

    if (!passkey) return res.status(404).json({ error: 'Passkey not found' });

    const expectedChallenge = challenges.get(voter.voter_id);

    try {
        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            authenticator: {
                credentialID: passkey.credential_id,
                credentialPublicKey: passkey.public_key,
                counter: passkey.counter,
            },
        });

        if (verification.verified) {
            await VoterPasskey.update(
                { counter: verification.authenticationInfo.newCounter, last_used: new Date() },
                { where: { id: passkey.id } }
            );

            const token = generateToken({
                voterId: voter.voter_id,
                role: 'voter',
                status: voter.status
            });

            res.json({ success: true, token, user: { fullName: voter.full_name } });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        challenges.delete(voter.voter_id);
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

        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (username !== adminUsername) {
            return res.status(401).json({
                error: 'Invalid credentials',
            });
        }

        const isValid = adminPasswordHash
            ? await bcrypt.compare(password, adminPasswordHash)
            : password === (process.env.ADMIN_PASSWORD || 'admin123'); // Demo only

        if (!isValid) {
            return res.status(401).json({
                error: 'Invalid credentials',
            });
        }

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
        logger.error('ADMIN_LOGIN_ERROR', { error: error.message });
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
