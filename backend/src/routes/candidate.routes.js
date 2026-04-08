const express = require('express');
const { Candidate, Election  } = require('../models/index.js');
const fabricService = require('../services/fabricService.js');
const { authenticate, authorize  } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');

const router = express.Router();
const canAccessElection = (req, election) => {
    if (req.user?.adminRole === 'SUPER_ADMIN') return true;
    return !!(req.user?.adminId && election.created_by_admin_id === req.user.adminId);
};

/**
 * GET /api/v1/candidates
 * Get all candidates (optionally filtered by election)
 */
router.get('/', async (req, res) => {
    try {
        const { electionId, districtId } = req.query;

        const where = {};
        if (electionId) where.election_id = electionId;
        if (districtId) where.district_id = districtId;

        const candidates = await Candidate.findAll({
            where,
            include: [{
                model: Election,
                as: 'election',
                attributes: ['name', 'election_type', 'status', 'created_by_admin_id'],
            }],
            order: [['full_name', 'ASC']],
        });

        res.json({
            success: true,
            candidates,
            count: candidates.length,
        });

    } catch (error) {
        console.error('Get candidates error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve candidates',
            message: error.message,
        });
    }
});

/**
 * GET /api/v1/candidates/:id
 * Get candidate by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const candidate = await Candidate.findByPk(req.params.id, {
            include: [{
                model: Election,
                as: 'election',
            }],
        });

        if (!candidate) {
            return res.status(404).json({
                success: false,
                error: 'Candidate not found',
            });
        }

        res.json({
            success: true,
            candidate,
        });

    } catch (error) {
        console.error('Get candidate error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve candidate',
            message: error.message,
        });
    }
});

/**
 * POST /api/v1/candidates
 * Register a new candidate (Admin only)
 */
router.post('/', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const {
            electionId,
            fullName,
            partyName,
            partySymbol,
            districtId,
            candidatePhoto,
        } = req.body;

        // Validate required fields
        if (!electionId || !fullName || !partyName || !districtId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['electionId', 'fullName', 'partyName', 'districtId'],
            });
        }

        // Verify election exists and is in valid state
        const election = await Election.findByPk(electionId);
        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found',
            });
        }

        // Cannot add candidates to active/completed elections
        if (!canAccessElection(req, election)) {
            return res.status(403).json({
                success: false,
                error: 'You can only add candidates to your own elections',
            });
        }

        if (['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(election.status)) {
            return res.status(403).json({
                success: false,
                error: `Cannot add candidates to election in ${election.status} status`,
            });
        }

        // Check for duplicate candidate name
        const existingCandidate = await Candidate.findOne({
            where: {
                election_id: electionId,
                full_name: fullName,
            },
        });

        if (existingCandidate) {
            return res.status(400).json({
                success: false,
                error: 'Candidate with this name already exists in this election',
            });
        }

        // Create candidate in database
        const candidate = await Candidate.create({
            election_id: electionId,
            full_name: fullName,
            party_name: partyName,
            party_symbol: partySymbol,
            district_id: districtId,
            candidate_photo: candidatePhoto,
            status: 'active',
        });

        // Register candidate on blockchain
        try {
            await fabricService.registerCandidate(
                candidate.candidate_id,
                electionId,
                fullName,
                partyName,
                districtId
            );
        } catch (blockchainError) {
            console.error('Blockchain registration error:', blockchainError.message);
            // Candidate created in DB but not on blockchain - log for manual resolution
        }

        res.status(201).json({
            success: true,
            message: 'Candidate registered successfully',
            candidate,
        });

    } catch (error) {
        console.error('Register candidate error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to register candidate',
            message: error.message,
        });
    }
});

/**
 * PUT /api/v1/candidates/:id
 * Update candidate details (Admin only)
 */
router.put('/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const candidate = await Candidate.findByPk(req.params.id, {
            include: [{
                model: Election,
                as: 'election',
            }],
        });

        if (!candidate) {
            return res.status(404).json({
                success: false,
                error: 'Candidate not found',
            });
        }

        // Check election status
        if (!canAccessElection(req, candidate.election)) {
            return res.status(403).json({
                success: false,
                error: 'You can only update candidates in your own elections',
            });
        }

        if (['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(candidate.election.status)) {
            return res.status(403).json({
                success: false,
                error: `Cannot update candidate in ${candidate.election.status} election`,
            });
        }

        const updateData = {};
        if (req.body.fullName) updateData.full_name = req.body.fullName;
        if (req.body.partyName) updateData.party_name = req.body.partyName;
        if (req.body.partySymbol) updateData.party_symbol = req.body.partySymbol;
        if (req.body.candidatePhoto) updateData.candidate_photo = req.body.candidatePhoto;
        if (req.body.status) updateData.status = req.body.status;

        await candidate.update(updateData);

        res.json({
            success: true,
            message: 'Candidate updated successfully',
            candidate,
        });

    } catch (error) {
        console.error('Update candidate error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to update candidate',
            message: error.message,
        });
    }
});

/**
 * DELETE /api/v1/candidates/:id
 * Delete candidate (Admin only, only from upcoming elections)
 */
router.delete('/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;

        const candidate = await Candidate.findByPk(id, {
            include: [{
                model: Election,
                as: 'election',
            }],
        });

        if (!candidate) {
            return res.status(404).json({
                success: false,
                error: 'Candidate not found',
            });
        }

        // Only allow deletion from upcoming elections
        if (!canAccessElection(req, candidate.election)) {
            return res.status(403).json({
                success: false,
                error: 'You can only delete candidates from your own elections',
            });
        }

        if (candidate.election.status !== 'PENDING') {
            return res.status(403).json({
                success: false,
                error: 'Can only delete candidates from upcoming elections',
            });
        }

        await candidate.destroy();

        res.json({
            success: true,
            message: 'Candidate deleted successfully',
        });

    } catch (error) {
        console.error('Delete candidate error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to delete candidate',
            message: error.message,
        });
    }
});

module.exports = router;
