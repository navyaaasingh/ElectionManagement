/**
 * Election Management Controller
 * Handles CRUD operations for elections
 */

const Election = require('../models/election.model.js');
const Candidate = require('../models/candidate.model.js');
const District = require('../models/index.js').District || require('../models/election.model.js'); // Use index or default
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Create new election
 * POST /api/v1/elections
 */
exports.createElection = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            name,
            type,
            startDate,
            endDate,
            description,
            districtIds,
            candidates,
            config
        } = req.body;

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start >= end) {
            return res.status(400).json({
                success: false,
                error: 'Start date must be before end date'
            });
        }

        if (start < new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Start date cannot be in the past'
            });
        }

        // Create election
        const election = await Election.create({
            name,
            election_type: type,
            start_date: start,
            end_date: end,
            description,
            status: 'PENDING',
            created_by: req.user.id,
            config: config || {}
        });

        // Associate districts
        if (districtIds && districtIds.length > 0) {
            await election.setDistricts(districtIds);
        }

        // Create candidates
        if (candidates && candidates.length > 0) {
            const candidatePromises = candidates.map(c =>
                Candidate.create({
                    election_id: election.election_id,
                    name: c.name,
                    party: c.party,
                    symbol: c.symbol,
                    manifesto: c.manifesto,
                    photo_url: c.photoUrl
                })
            );
            await Promise.all(candidatePromises);
        }

        // Log action
        await logger.auditLog({
            event_type: 'ELECTION_CREATED',
            user_id: req.user.id,
            metadata: {
                election_id: election.election_id,
                name: election.name
            }
        });

        // Fetch complete election with relations
        const completeElection = await Election.findByPk(election.election_id, {
            include: [
                { model: District },
                { model: Candidate }
            ]
        });

        res.status(201).json({
            success: true,
            election: completeElection
        });

    } catch (error) {
        logger.error('Error creating election:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create election'
        });
    }
};

/**
 * Get all elections
 * GET /api/v1/elections
 */
exports.getAllElections = async (req, res) => {
    try {
        const { status, type, limit = 50, offset = 0 } = req.query;

        const where = {};
        if (status) where.status = status;
        if (type) where.type = type;

        const elections = await Election.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['start_date', 'DESC']]
        });

        res.json({
            success: true,
            elections: elections.rows,
            total: elections.count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        logger.error('Error fetching elections:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch elections'
        });
    }
};

/**
 * Get election by ID
 * GET /api/v1/elections/:id
 */
exports.getElectionById = async (req, res) => {
    try {
        const { id } = req.params;

        const election = await Election.findByPk(id, {
            include: [
                { model: District },
                { model: Candidate },
                {
                    model: require('../models/VotingRecord'),
                    attributes: ['voter_id', 'has_voted', 'voted_at']
                }
            ]
        });

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found'
            });
        }

        // Calculate statistics
        const votingRecords = await require('../models/VotingRecord').count({
            where: {
                election_id: id,
                has_voted: true
            }
        });

        const totalVoters = await require('../models/Voter').count({
            include: [{
                model: District,
                through: {
                    where: { election_id: id }
                }
            }]
        });

        res.json({
            success: true,
            election,
            statistics: {
                totalVotes: votingRecords,
                totalVoters,
                turnout: totalVoters > 0 ? (votingRecords / totalVoters * 100).toFixed(2) : 0
            }
        });

    } catch (error) {
        logger.error('Error fetching election:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch election'
        });
    }
};

/**
 * Update election
 * PUT /api/v1/elections/:id
 */
exports.updateElection = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const election = await Election.findByPk(id);

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found'
            });
        }

        // Prevent updates to active/completed elections
        if (['ACTIVE', 'COMPLETED', 'CERTIFIED'].includes(election.status)) {
            return res.status(403).json({
                success: false,
                error: `Cannot update election in ${election.status} status`
            });
        }

        // Update allowed fields
        const allowedFields = ['name', 'description', 'start_date', 'end_date', 'config'];
        const updateData = {};

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                updateData[field] = updates[field];
            }
        });

        await election.update(updateData);

        // Log action
        await logger.auditLog({
            event_type: 'ELECTION_UPDATED',
            user_id: req.user.id,
            metadata: {
                election_id: id,
                updates: Object.keys(updateData)
            }
        });

        const updatedElection = await Election.findByPk(id, {
            include: [
                { model: District },
                { model: Candidate }
            ]
        });

        res.json({
            success: true,
            election: updatedElection
        });

    } catch (error) {
        logger.error('Error updating election:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update election'
        });
    }
};

/**
 * Delete election
 * DELETE /api/v1/elections/:id
 */
exports.deleteElection = async (req, res) => {
    try {
        const { id } = req.params;

        const election = await Election.findByPk(id);

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found'
            });
        }

        // Only allow deletion of scheduled elections
        if (election.status !== 'SCHEDULED') {
            return res.status(403).json({
                success: false,
                error: 'Can only delete scheduled elections'
            });
        }

        // Check if any votes have been cast
        const voteCount = await require('../models/VotingRecord').count({
            where: { election_id: id }
        });

        if (voteCount > 0) {
            return res.status(403).json({
                success: false,
                error: 'Cannot delete election with existing votes'
            });
        }

        // Delete associated candidates first
        await Candidate.destroy({
            where: { election_id: id }
        });

        await election.destroy();

        // Log action
        await logger.auditLog({
            event_type: 'ELECTION_DELETED',
            user_id: req.user.id,
            metadata: {
                election_id: id,
                name: election.name
            }
        });

        res.json({
            success: true,
            message: 'Election deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting election:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete election'
        });
    }
};

/**
 * Open polls (activate election)
 * POST /api/v1/elections/:id/open
 */
exports.openPolls = async (req, res) => {
    try {
        const { id } = req.params;
        const { signature } = req.body;

        // Verify user has COMMISSIONER role
        if (req.user.role !== 'COMMISSIONER') {
            return res.status(403).json({
                success: false,
                error: 'Only Election Commissioner can open polls'
            });
        }

        const election = await Election.findByPk(id);

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found'
            });
        }

        if (election.status !== 'SCHEDULED') {
            return res.status(400).json({
                success: false,
                error: `Cannot open election in ${election.status} status`
            });
        }

        // Verify it's election day
        const now = new Date();
        if (now < election.start_date) {
            return res.status(400).json({
                success: false,
                error: 'Cannot open polls before start date'
            });
        }

        // Update election status
        await election.update({
            status: 'ACTIVE',
            opened_at: now,
            opened_by: req.user.id
        });

        // Broadcast to all IoT terminals to activate
        const iotService = require('../services/iotService');
        await iotService.broadcastActivation(id);

        // Log action with digital signature
        await logger.auditLog({
            event_type: 'POLLS_OPENED',
            user_id: req.user.id,
            severity: 'CRITICAL',
            metadata: {
                election_id: id,
                signature,
                timestamp: now.toISOString()
            }
        });

        res.json({
            success: true,
            message: 'Polls opened successfully',
            election: {
                id: election.election_id,
                status: election.status,
                opened_at: election.opened_at
            }
        });

    } catch (error) {
        logger.error('Error opening polls:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to open polls'
        });
    }
};

/**
 * Close polls (deactivate election)
 * POST /api/v1/elections/:id/close
 */
exports.closePolls = async (req, res) => {
    try {
        const { id } = req.params;
        const { signature } = req.body;

        // Verify user has COMMISSIONER role
        if (req.user.role !== 'COMMISSIONER') {
            return res.status(403).json({
                success: false,
                error: 'Only Election Commissioner can close polls'
            });
        }

        const election = await Election.findByPk(id);

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found'
            });
        }

        if (election.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                error: 'Can only close active elections'
            });
        }

        const now = new Date();

        // Update election status
        await election.update({
            status: 'CLOSED',
            closed_at: now,
            closed_by: req.user.id
        });

        // Broadcast to all IoT terminals to deactivate
        const iotService = require('../services/iotService');
        await iotService.broadcastDeactivation(id);

        // Trigger result tallying
        const resultsService = require('../services/resultsService');
        await resultsService.triggerTally(id);

        // Log action
        await logger.auditLog({
            event_type: 'POLLS_CLOSED',
            user_id: req.user.id,
            severity: 'CRITICAL',
            metadata: {
                election_id: id,
                signature,
                timestamp: now.toISOString()
            }
        });

        res.json({
            success: true,
            message: 'Polls closed successfully',
            election: {
                id: election.election_id,
                status: election.status,
                closed_at: election.closed_at
            }
        });

    } catch (error) {
        logger.error('Error closing polls:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to close polls'
        });
    }
};

module.exports = exports;
