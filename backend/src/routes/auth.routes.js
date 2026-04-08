const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Voter, Student, AdminUser } = require('../models/index.js');
const { generateToken, verifyToken, authenticate, authorize } = require('../middleware/auth.middleware.js');
const { authLimiter } = require('../middleware/rateLimit.middleware.js');
const { makeCsrfToken, csrfProtection } = require('../middleware/csrf.middleware.js');
const logger = require('../utils/logger.js');

const router = express.Router();

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ELECTION_OFFICER', 'TECHNICAL_ADMIN', 'OBSERVER']);

const buildAdminToken = (admin) => {
    const isObserver = admin.role === 'OBSERVER';
    return generateToken({
        adminId: admin.admin_id,
        username: admin.username,
        email: admin.email,
        role: isObserver ? 'observer' : 'admin',
        adminRole: admin.role,
        districtId: admin.district_id || null,
        permissions: isObserver
            ? ['view_results', 'view_audit']
            : ['manage_elections', 'manage_candidates', 'view_results', 'manage_voters', 'manage_students'],
    });
};

const getScopedAdminFilter = (req) => {
    if (req.user?.adminRole === 'SUPER_ADMIN') {
        return {};
    }
    if (req.user?.adminId) {
        return { admin_id: req.user.adminId };
    }
    return {};
};

const resolveAdminFromStudent = async (rollNumber) => {
    if (!rollNumber) return null;
    const student = await Student.findOne({
        where: { roll_number: rollNumber },
        attributes: ['admin_id'],
    });
    return student?.admin_id || null;
};

/**
 * POST /api/v1/auth/register-voter
 * Legacy registration endpoint (IoT flow)
 */
router.post('/register-voter', async (req, res) => {
    try {
        const {
            aadharNumber,
            fullName,
            biometricTemplate,
            districtId,
            rollNumber,
        } = req.body;

        if (!aadharNumber || !fullName || !biometricTemplate || !districtId) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['aadharNumber', 'fullName', 'biometricTemplate', 'districtId'],
            });
        }

        if (!/^\d{12}$/.test(aadharNumber)) {
            return res.status(400).json({
                error: 'Invalid Aadhar number',
                message: 'Aadhar number must be exactly 12 digits',
            });
        }

        const existingVoter = await Voter.findOne({ where: { aadhar_number: aadharNumber } });
        if (existingVoter) {
            return res.status(409).json({
                error: 'Voter already registered',
                message: 'A voter with this Aadhar number already exists',
            });
        }

        const biometricHash = crypto.createHash('sha256').update(biometricTemplate).digest('hex');
        const adminId = await resolveAdminFromStudent(rollNumber);

        const voter = await Voter.create({
            roll_number: rollNumber || null,
            aadhar_number: aadharNumber,
            full_name: fullName,
            biometric_hash: biometricHash,
            district_id: districtId,
            admin_id: adminId,
            status: 'active',
            is_approved: true,
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
        logger.error('VOTER_REGISTRATION_ERROR', { error: error.message });
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                error: 'Duplicate entry',
                message: 'Voter with same Aadhar/biometric already exists',
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

        const biometricHash = crypto.createHash('sha256').update(biometricTemplate).digest('hex');
        const voter = await Voter.findOne({ where: { biometric_hash: biometricHash, status: 'active' } });

        if (!voter) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Biometric data not recognized',
            });
        }

        const token = generateToken({
            voterId: voter.voter_id,
            districtId: voter.district_id,
            adminId: voter.admin_id || null,
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
                adminId: voter.admin_id,
                hasVoted: voter.has_voted,
            },
            token,
        });
    } catch (error) {
        logger.error('BIOMETRIC_AUTH_ERROR', { error: error.message });
        res.status(500).json({ error: 'Authentication failed', message: error.message });
    }
});

/**
 * POST /api/v1/auth/login-email
 * Voter login with email and password
 */
router.post('/login-email', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing credentials',
                required: ['email', 'password'],
            });
        }

        if (email === 'student@demo.edu' && password === 'demo1234') {
            const token = generateToken({
                voterId: 'demo-voter-id',
                districtId: 'demo-district-id',
                role: 'voter',
                terminalId: 'demo',
            });
            return res.json({
                success: true,
                message: 'Demo login successful',
                token,
                user: {
                    voterId: 'demo-voter-id',
                    fullName: 'Demo Student',
                    email: 'student@demo.edu',
                    hasVoted: false,
                },
            });
        }

        const voter = await Voter.findOne({ where: { email } });
        if (!voter) {
            return res.status(404).json({
                code: 'VOTER_NOT_FOUND',
                error: 'No account found with this email. Please register first.',
            });
        }

        const isValid = voter.password ? await bcrypt.compare(password, voter.password) : false;
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (voter.status !== 'active') {
            return res.status(403).json({
                code: 'APPROVAL_PENDING',
                error: 'Approval pending',
            });
        }

        const token = generateToken({
            voterId: voter.voter_id,
            districtId: voter.district_id,
            adminId: voter.admin_id || null,
            role: 'voter',
        });

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                voterId: voter.voter_id,
                fullName: voter.full_name,
                email: voter.email,
                districtId: voter.district_id,
                adminId: voter.admin_id,
                hasVoted: voter.has_voted,
            },
        });
    } catch (error) {
        logger.error('EMAIL_LOGIN_ERROR', { error: error.message });
        res.status(500).json({ error: 'Login failed', message: error.message });
    }
});

/**
 * POST /api/v1/auth/admin/register
 * Register a new admin user (SUPER_ADMIN only, or first admin bootstrap when table is empty)
 */
router.post('/admin/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, role = 'ELECTION_OFFICER', districtId } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['username', 'email', 'password'],
            });
        }

        if (!ADMIN_ROLES.has(role)) {
            return res.status(400).json({
                error: 'Invalid role',
                validRoles: Array.from(ADMIN_ROLES),
            });
        }

        const totalAdmins = await AdminUser.count();
        if (totalAdmins > 0) {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const decoded = verifyToken(authHeader.substring(7));
            if (decoded.role !== 'admin' || decoded.adminRole !== 'SUPER_ADMIN') {
                return res.status(403).json({ error: 'Only SUPER_ADMIN can create admin accounts' });
            }
        }

        const existing = await AdminUser.findOne({
            where: {
                [Op.or]: [{ username }, { email }],
            },
        });
        if (existing) {
            return res.status(409).json({ error: 'Admin username/email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const admin = await AdminUser.create({
            username,
            email,
            password_hash: passwordHash,
            role,
            district_id: districtId || null,
            is_active: true,
        });

        res.status(201).json({
            success: true,
            message: 'Admin created successfully',
            admin: {
                adminId: admin.admin_id,
                username: admin.username,
                email: admin.email,
                role: admin.role,
                districtId: admin.district_id,
            },
        });
    } catch (error) {
        logger.error('ADMIN_REGISTER_ERROR', { error: error.message });
        res.status(500).json({ error: 'Failed to register admin', message: error.message });
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

        const admin = await AdminUser.findOne({ where: { username } });
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!admin.is_active) {
            return res.status(403).json({ error: 'Admin account is inactive' });
        }

        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await admin.update({ last_login: new Date() });
        const token = buildAdminToken(admin);
        const csrfToken = makeCsrfToken({
            adminId: admin.admin_id,
            username: admin.username,
            role: 'admin',
            adminRole: admin.role,
        });

        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            csrfToken,
            user: {
                adminId: admin.admin_id,
                username: admin.username,
                email: admin.email,
                role: 'admin',
                adminRole: admin.role,
                districtId: admin.district_id,
            },
        });
    } catch (error) {
        logger.error('ADMIN_LOGIN_ERROR', { error: error.message });
        res.status(500).json({ error: 'Login failed', message: error.message });
    }
});

/**
 * POST /api/v1/auth/aadhaar-verify
 * Demo identity verification endpoint
 */
router.post('/aadhaar-verify', async (req, res) => {
    const { aadharNumber } = req.body || {};
    const raw = (aadharNumber || '').replace(/\s/g, '');
    if (!/^\d{12}$/.test(raw)) {
        return res.status(400).json({ success: false, error: 'Invalid Aadhaar number format' });
    }
    return res.json({ success: true, verified: true, message: 'Aadhaar verified (demo mode)' });
});

/**
 * GET /api/v1/auth/verify
 * Verify JWT token validity
 */
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ valid: false, error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token);
        res.json({ valid: true, user: decoded });
    } catch (error) {
        res.status(401).json({ valid: false, error: error.message });
    }
});

/**
 * POST /api/v1/auth/signup-voter
 * Register a new voter via email/password. Saves as pending.
 */
router.post('/signup-voter', async (req, res) => {
    try {
        const { rollNumber, email, password, fullName, aadharNumber, districtId } = req.body;

        if (!email || !password || !fullName || !rollNumber) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['rollNumber', 'email', 'password', 'fullName'],
            });
        }

        const student = await Student.findOne({ where: { roll_number: rollNumber } });
        if (!student) {
            return res.status(404).json({
                error: 'Student not found',
                message: 'Roll number not found in student database. Ask admin to add student first.',
            });
        }

        const existingByEmail = await Voter.findOne({ where: { email } });
        if (existingByEmail) {
            return res.status(409).json({
                error: 'Email already registered',
                message: 'An account with this email already exists.',
            });
        }

        const rawAadhaar = (aadharNumber || '').replace(/\s/g, '');
        if (rawAadhaar && rawAadhaar !== '000000000000') {
            const existingByAadhaar = await Voter.findOne({ where: { aadhar_number: rawAadhaar } });
            if (existingByAadhaar) {
                return res.status(409).json({
                    error: 'Aadhaar already registered',
                    message: 'This Aadhaar number is already linked to a voter.',
                });
            }
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const placeholderBiometric = crypto
            .createHash('sha256')
            .update(`email_reg_${email}_${Date.now()}`)
            .digest('hex');

        let resolvedDistrictId = districtId;
        if (!resolvedDistrictId) {
            const { sequelize } = require('../db/index.js');
            const [districts] = await sequelize.query('SELECT district_id FROM districts LIMIT 1');
            resolvedDistrictId = districts[0]?.district_id;
        }

        if (!resolvedDistrictId) {
            return res.status(400).json({
                error: 'District required',
                message: 'No district available. Please contact your administrator.',
            });
        }

        const voter = await Voter.create({
            roll_number: rollNumber,
            email,
            password: passwordHash,
            full_name: fullName,
            aadhar_number: rawAadhaar && rawAadhaar !== '000000000000' ? rawAadhaar : `9999${Date.now().toString().slice(-8)}`,
            biometric_hash: placeholderBiometric,
            district_id: resolvedDistrictId,
            admin_id: student.admin_id || null,
            status: 'pending',
            is_approved: false,
        });

        logger.info('VOTER_REGISTERED', {
            voterId: voter.voter_id,
            email,
            rollNumber,
            timestamp: new Date().toISOString(),
        });

        res.status(201).json({
            success: true,
            message: 'Registration successful. Awaiting admin approval.',
            voterId: voter.voter_id,
            voter: {
                voterId: voter.voter_id,
                fullName: voter.full_name,
                email: voter.email,
                rollNumber: voter.roll_number,
                adminId: voter.admin_id,
                status: voter.status,
                registrationDate: voter.registration_date,
            },
        });
    } catch (error) {
        logger.error('SIGNUP_VOTER_ERROR', { error: error.message });
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                error: 'Account already exists',
                message: 'A voter with this email or Aadhaar is already registered.',
            });
        }
        res.status(500).json({ error: 'Registration failed', message: error.message });
    }
});

/**
 * GET /api/v1/auth/registrations
 * Admin: Get voter registrations cross-referenced with students.
 */
router.get('/registrations', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, search, limit = 50, offset = 0 } = req.query;
        const where = { ...getScopedAdminFilter(req) };

        if (status) where.status = status;
        if (search) {
            where[Op.or] = [
                { full_name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { roll_number: { [Op.like]: `%${search}%` } },
            ];
        }

        const studentsWhere = { ...getScopedAdminFilter(req) };

        const [registeredVoters, totalStudents, totalRegistered, pendingCount, approvedCount] = await Promise.all([
            Voter.findAll({
                where,
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10),
                order: [['createdAt', 'DESC']],
                attributes: ['voter_id', 'roll_number', 'email', 'full_name', 'status', 'is_approved', 'registration_date', 'has_voted', 'admin_id', 'createdAt'],
            }),
            Student.count({ where: studentsWhere }),
            Voter.count({ where: getScopedAdminFilter(req) }),
            Voter.count({ where: { ...getScopedAdminFilter(req), status: 'pending' } }),
            Voter.count({ where: { ...getScopedAdminFilter(req), status: 'active' } }),
        ]);

        const registeredRollNumbers = registeredVoters.map((v) => v.roll_number).filter(Boolean);

        const unregisteredStudents = await Student.findAll({
            where: {
                ...studentsWhere,
                ...(registeredRollNumbers.length > 0 ? { roll_number: { [Op.notIn]: registeredRollNumbers } } : {}),
            },
            limit: 20,
            attributes: ['student_id', 'roll_number', 'name', 'department', 'course', 'admin_id'],
        });

        res.json({
            success: true,
            summary: {
                totalStudents,
                totalRegistered,
                pendingApproval: pendingCount,
                approved: approvedCount,
                notRegistered: Math.max(totalStudents - totalRegistered, 0),
            },
            registrations: registeredVoters,
            unregisteredStudents,
            pagination: {
                total: totalRegistered,
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10),
            },
        });
    } catch (error) {
        logger.error('REGISTRATIONS_FETCH_ERROR', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch registrations', message: error.message });
    }
});

/**
 * PUT /api/v1/auth/registrations/:voterId/approve
 * Admin: Approve pending voter registration.
 */
router.put('/registrations/:voterId/approve', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { voterId } = req.params;
        const scoped = getScopedAdminFilter(req);

        const voter = await Voter.findOne({
            where: {
                voter_id: voterId,
                ...scoped,
            },
        });

        if (!voter) {
            return res.status(404).json({ error: 'Voter not found in your admin scope' });
        }

        voter.status = 'active';
        voter.is_approved = true;
        await voter.save();

        logger.info('VOTER_APPROVED', { voterId, approvedBy: req.user.username });

        res.json({
            success: true,
            message: 'Voter approved successfully.',
            voter: {
                voterId: voter.voter_id,
                status: voter.status,
                is_approved: voter.is_approved,
                adminId: voter.admin_id,
            },
        });
    } catch (error) {
        logger.error('VOTER_APPROVAL_ERROR', { error: error.message });
        res.status(500).json({ error: 'Approval failed', message: error.message });
    }
});

/**
 * POST /api/v1/auth/voters/bulk-validate
 * Validate bulk voter payload without inserting records
 */
router.post('/voters/bulk-validate', authenticate, authorize('admin'), async (req, res) => {
    try {
        const voters = Array.isArray(req.body?.voters) ? req.body.voters : [];
        if (!voters.length) {
            return res.status(400).json({ success: false, error: 'No voters provided' });
        }

        const errors = [];
        const normalized = voters.map((v, idx) => {
            const rollNumber = String(v.rollNumber || v.roll_number || '').trim().toUpperCase();
            const email = String(v.email || '').trim().toLowerCase();
            const fullName = String(v.fullName || v.full_name || '').trim();
            const aadharNumber = String(v.aadharNumber || v.aadhar_number || '').replace(/\s/g, '');
            const districtId = v.districtId || v.district_id || null;

            if (!rollNumber) errors.push({ row: idx + 1, field: 'rollNumber', message: 'Required' });
            if (!email || !email.includes('@')) errors.push({ row: idx + 1, field: 'email', message: 'Invalid email' });
            if (!fullName) errors.push({ row: idx + 1, field: 'fullName', message: 'Required' });
            if (aadharNumber && !/^\d{12}$/.test(aadharNumber)) errors.push({ row: idx + 1, field: 'aadharNumber', message: 'Must be 12 digits' });

            return { rollNumber, email, fullName, aadharNumber, districtId };
        });

        const duplicateRolls = normalized
            .map((v) => v.rollNumber)
            .filter((r, i, arr) => r && arr.indexOf(r) !== i);

        if (duplicateRolls.length) {
            duplicateRolls.forEach((roll) => errors.push({ row: null, field: 'rollNumber', message: `Duplicate in file: ${roll}` }));
        }

        const existingEmails = await Voter.findAll({
            where: { email: normalized.map((v) => v.email) },
            attributes: ['email'],
        });
        const existingEmailSet = new Set(existingEmails.map((v) => v.email));
        normalized.forEach((v, idx) => {
            if (existingEmailSet.has(v.email)) {
                errors.push({ row: idx + 1, field: 'email', message: 'Already registered' });
            }
        });

        res.json({
            success: true,
            summary: {
                total: voters.length,
                valid: Math.max(voters.length - errors.filter((e) => e.row).length, 0),
                errors: errors.length,
            },
            errors,
            normalized,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Bulk validation failed', message: error.message });
    }
});

/**
 * POST /api/v1/auth/voters/bulk-import
 * Bulk create pending voters (admin scoped)
 */
router.post('/voters/bulk-import', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const voters = Array.isArray(req.body?.voters) ? req.body.voters : [];
        if (!voters.length) {
            return res.status(400).json({ success: false, error: 'No voters provided' });
        }

        const created = [];
        const rejected = [];

        for (const [idx, raw] of voters.entries()) {
            try {
                const rollNumber = String(raw.rollNumber || raw.roll_number || '').trim().toUpperCase();
                const email = String(raw.email || '').trim().toLowerCase();
                const fullName = String(raw.fullName || raw.full_name || '').trim();
                const districtId = raw.districtId || raw.district_id || null;
                const aadhar = String(raw.aadharNumber || raw.aadhar_number || '').replace(/\s/g, '');

                if (!rollNumber || !email || !fullName) {
                    throw new Error('Missing required fields');
                }

                const student = await Student.findOne({
                    where: {
                        roll_number: rollNumber,
                        ...(req.user.adminRole === 'SUPER_ADMIN' ? {} : { admin_id: req.user.adminId }),
                    },
                });
                if (!student) throw new Error('Student not found in your scope');

                const existing = await Voter.findOne({ where: { [Op.or]: [{ email }, { roll_number: rollNumber }] } });
                if (existing) throw new Error('Voter already exists');

                const placeholderBiometric = crypto
                    .createHash('sha256')
                    .update(`bulk_import_${email}_${Date.now()}`)
                    .digest('hex');

                let resolvedDistrictId = districtId || req.user.districtId;
                if (!resolvedDistrictId) {
                    const { sequelize } = require('../db/index.js');
                    const [districts] = await sequelize.query('SELECT district_id FROM districts LIMIT 1');
                    resolvedDistrictId = districts[0]?.district_id;
                }
                if (!resolvedDistrictId) throw new Error('No valid district found');

                const voter = await Voter.create({
                    roll_number: rollNumber,
                    email,
                    password: await bcrypt.hash(raw.password || 'ChangeMe@123', 12),
                    full_name: fullName,
                    aadhar_number: /^\d{12}$/.test(aadhar) ? aadhar : `9999${Date.now().toString().slice(-8)}`,
                    biometric_hash: placeholderBiometric,
                    district_id: resolvedDistrictId,
                    admin_id: student.admin_id || req.user.adminId || null,
                    status: 'pending',
                    is_approved: false,
                });
                created.push(voter.voter_id);
            } catch (e) {
                rejected.push({ row: idx + 1, reason: e.message });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Bulk import processed',
            createdCount: created.length,
            rejectedCount: rejected.length,
            created,
            rejected,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Bulk import failed', message: error.message });
    }
});

module.exports = router;
