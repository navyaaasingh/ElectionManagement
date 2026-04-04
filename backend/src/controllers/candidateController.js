/**
 * Candidate Management Controller
 * Handles CRUD operations for election candidates
 */

const Candidate = require('../models/candidate.model.js');
const Election = require('../models/election.model.js');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Add candidate to election
 * POST /api/v1/candidates
 */
exports.addCandidate = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            electionId,
            district_id,
            name,
            party,
            symbol,
            manifesto,
            photoUrl
        } = req.body;

        // Verify election exists and is in valid state
        const election = await Election.findByPk(electionId);

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found'
            });
        }

        if (['ACTIVE', 'CLOSED', 'COMPLETED'].includes(election.status)) {
            return res.status(403).json({
                success: false,
                error: `Cannot add candidates to election in ${election.status} status`
            });
        }

        // Check for duplicate candidate name in same election
        const existingCandidate = await Candidate.findOne({
            where: {
                election_id: electionId,
                name
            }
        });

        if (existingCandidate) {
            return res.status(400).json({
                success: false,
                error: 'Candidate with this name already exists in this election'
            });
        }

        // Create candidate
        const candidate = await Candidate.create({
            election_id: electionId,
            district_id: district_id,
            full_name: name,
            party_name: party,
            party_symbol: symbol,
            manifesto_summary: manifesto,
            candidate_photo: photoUrl
        });

        // Log action
        await logger.auditLog({
            event_type: 'CANDIDATE_ADDED',
            user_id: req.user.id,
            metadata: {
                candidate_id: candidate.candidate_id,
                election_id: electionId,
                name
            }
        });

        res.status(201).json({
            success: true,
            candidate
        });

    } catch (error) {
        logger.error('Error adding candidate:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add candidate'
        });
    }
};

/**
 * Get all candidates for an election
 * GET /api/v1/elections/:electionId/candidates
 */
exports.getCandidates = async (req, res) => {
    try {
        const { electionId } = req.params;

        const candidates = await Candidate.findAll({
            where: { election_id: electionId },
            order: [['name', 'ASC']]
        });

        // Get vote counts if election is closed or completed
        const election = await Election.findByPk(electionId);

        if (election && ['CLOSED', 'COMPLETED', 'CERTIFIED'].includes(election.status)) {
            // Fetch results from blockchain
            const fabricService = require('../services/fabricService');
            const results = await fabricService.getResults(electionId);

            // Merge vote counts with candidate data
            const candidatesWithVotes = candidates.map(candidate => {
                const result = results.find(r => r.candidateId === candidate.candidate_id);
                return {
                    ...candidate.toJSON(),
                    voteCount: result ? result.count : 0
                };
            });

            return res.json({
                success: true,
                candidates: candidatesWithVotes
            });
        }

        res.json({
            success: true,
            candidates
        });

    } catch (error) {
        logger.error('Error fetching candidates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch candidates'
        });
    }
};

/**
 * Update candidate
 * PUT /api/v1/candidates/:id
 */
exports.updateCandidate = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const candidate = await Candidate.findByPk(id, {
            include: [Election]
        });

        if (!candidate) {
            return res.status(404).json({
                success: false,
                error: 'Candidate not found'
            });
        }

        // Check election status
        if (['ACTIVE', 'CLOSED', 'COMPLETED'].includes(candidate.Election.status)) {
            return res.status(403).json({
                success: false,
                error: `Cannot update candidate in ${candidate.Election.status} election`
            });
        }

        // Update allowed fields
        const allowedFields = ['name', 'party', 'symbol', 'manifesto', 'photo_url'];
        const updateData = {};

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                updateData[field] = updates[field];
            }
        });

        await candidate.update(updateData);

        // Log action
        await logger.auditLog({
            event_type: 'CANDIDATE_UPDATED',
            user_id: req.user.id,
            metadata: {
                candidate_id: id,
                updates: Object.keys(updateData)
            }
        });

        res.json({
            success: true,
            candidate
        });

    } catch (error) {
        logger.error('Error updating candidate:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update candidate'
        });
    }
};

/**
 * Delete candidate
 * DELETE /api/v1/candidates/:id
 */
exports.deleteCandidate = async (req, res) => {
    try {
        const { id } = req.params;

        const candidate = await Candidate.findByPk(id, {
            include: [Election]
        });

        if (!candidate) {
            return res.status(404).json({
                success: false,
                error: 'Candidate not found'
            });
        }

        // Only allow deletion from scheduled elections
        if (candidate.Election.status !== 'SCHEDULED') {
            return res.status(403).json({
                success: false,
                error: 'Can only delete candidates from scheduled elections'
            });
        }

        await candidate.destroy();

        // Log action
        await logger.auditLog({
            event_type: 'CANDIDATE_DELETED',
            user_id: req.user.id,
            metadata: {
                candidate_id: id,
                name: candidate.name,
                election_id: candidate.election_id
            }
        });

        res.json({
            success: true,
            message: 'Candidate deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting candidate:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete candidate'
        });
    }
};

module.exports = exports;
