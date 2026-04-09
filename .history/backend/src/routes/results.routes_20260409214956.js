const express = require('express');
const { Election, Candidate  } = require('../models/index.js');
const fabricService = require('../services/fabricService.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { resultsLimiter } = require('../middleware/rateLimit.middleware.js');
const { redisClient } = require('../db/index.js');
const logger = require('../utils/logger.js');
const runoffService = require('../services/runoffService.js');

const router = express.Router();

/**
 * GET /api/v1/results/:electionId/preview
 * Preview results before certification (admin/observer only)
 */
router.get('/:electionId/preview', authenticate, authorize('admin', 'observer'), resultsLimiter, async (req, res) => {
    try {
        const { electionId } = req.params;
        const election = await Election.findByPk(electionId, {
            include: [{ model: Candidate, as: 'candidates' }],
        });
        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        let results = [];
        try {
            results = await fabricService.getResults(electionId);
        } catch (error) {
            logger.warn('Preview results fallback to DB-only due to Fabric error', { electionId, error: error.message });
        }

        const candidatesWithVotes = election.candidates.map((candidate) => {
            const result = results.find((r) => r.candidateId === candidate.candidate_id);
            return {
                candidate_id: candidate.candidate_id,
                full_name: candidate.full_name,
                party_name: candidate.party_name,
                voteCount: result ? result.voteCount : 0,
            };
        }).sort((a, b) => b.voteCount - a.voteCount);

        res.json({
            success: true,
            uncertified: true,
            election: {
                election_id: election.election_id,
                election_name: election.name,
                election_type: election.election_type,
                status: String(election.status || '').toLowerCase(),
            },
            preview: candidatesWithVotes,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to preview results', message: error.message });
    }
});

/**
 * GET /api/v1/results/:electionId
 * Get election results
 * Public endpoint (no auth required for completed elections)
 */
router.get('/:electionId', resultsLimiter, async (req, res) => {
    try {
        const { electionId } = req.params;
        const cacheKey = `results:election:${electionId}`;

        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        } catch (cacheErr) {
            console.warn('Results cache read failed:', cacheErr.message);
        }

        // Verify election exists
        const election = await Election.findByPk(electionId, {
            include: [{
                model: Candidate,
                as: 'candidates',
            }],
        });

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found',
            });
        }

        // Only show results for completed elections
        if (election.status === 'PENDING') {
            return res.status(403).json({
                success: false,
                error: 'Results not available for upcoming elections',
            });
        }

        // Fetch results from blockchain
        let results = [];
        try {
            results = await fabricService.getResults(electionId);
        } catch (blockchainError) {
            console.error('Blockchain results error:', blockchainError.message);
            // Fallback to database if blockchain unavailable
            // Results are calculated from vote records
        }

        // Merge vote counts with candidate data
        const candidatesWithVotes = election.candidates.map(candidate => {
            const result = results.find(r => r.candidateId === candidate.candidate_id);
            return {
                candidate_id: candidate.candidate_id,
                full_name: candidate.full_name,
                party_name: candidate.party_name,
                party_symbol: candidate.party_symbol,
                candidate_photo: candidate.candidate_photo,
                voteCount: result ? result.voteCount : 0,
            };
        });

        // Sort by vote count descending
        candidatesWithVotes.sort((a, b) => b.voteCount - a.voteCount);

        // Calculate winner (if election completed)
        let winner = null;
        if (election.status === 'COMPLETED' && candidatesWithVotes.length > 0) {
            winner = candidatesWithVotes[0];
        }

        const payload = {
            success: true,
            election: {
                election_id: election.election_id,
                election_name: election.name,
                election_type: election.election_type,
                status: String(election.status || '').toLowerCase(),
                start_date: election.start_date,
                end_date: election.end_date,
                runoff_config: election.runoff_config || null,
            },
            results: candidatesWithVotes,
            summary: {
                totalVoters: null,
                totalVotesCast: candidatesWithVotes.reduce((sum, c) => sum + (c.voteCount || 0), 0),
                turnoutPercentage: null,
                winner: winner ? {
                    name: winner.full_name,
                    party: winner.party_name,
                    votes: winner.voteCount,
                } : null,
            },
        };

        try {
            payload.runoff = await runoffService.calculateRunoff(election);
        } catch (runoffErr) {
            logger.warn('Runoff calculation skipped', { electionId, error: runoffErr.message });
            payload.runoff = { mode: 'single_round', rounds: [], winner: null, eliminated: [] };
        }

        try {
            await redisClient.set(cacheKey, JSON.stringify(payload), { EX: Number(process.env.RESULTS_CACHE_TTL_SEC || 15) });
        } catch (cacheErr) {
            console.warn('Results cache write failed:', cacheErr.message);
        }

        res.json(payload);

    } catch (error) {
        console.error('Get results error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve results',
            message: error.message,
        });
    }
});

/**
 * GET /api/v1/results/:electionId/district/:districtId
 * Get election results by district
 */
router.get('/:electionId/district/:districtId', resultsLimiter, async (req, res) => {
    try {
        const { electionId, districtId } = req.params;

        // Verify election exists
        const election = await Election.findByPk(electionId);
        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found',
            });
        }

        // Get candidates for this district
        const candidates = await Candidate.findAll({
            where: {
                election_id: electionId,
                district_id: districtId,
            },
        });

        // Fetch district results from blockchain
        let results = [];
        try {
            results = await fabricService.getResultsByDistrict(electionId, districtId);
        } catch (blockchainError) {
            console.error('Blockchain district results error:', blockchainError.message);
        }

        // Merge vote counts
        const candidatesWithVotes = candidates.map(candidate => {
            const result = results.find(r => r.candidateId === candidate.candidate_id);
            return {
                candidate_id: candidate.candidate_id,
                full_name: candidate.full_name,
                party_name: candidate.party_name,
                voteCount: result ? result.voteCount : 0,
            };
        });

        candidatesWithVotes.sort((a, b) => b.voteCount - a.voteCount);

        res.json({
            success: true,
            district_id: districtId,
            election_id: electionId,
            results: candidatesWithVotes,
        });

    } catch (error) {
        console.error('Get district results error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve district results',
            message: error.message,
        });
    }
});

/**
 * GET /api/v1/results/:electionId/runoff
 * Compute multi-round elimination breakdown when configured.
 */
router.get('/:electionId/runoff', resultsLimiter, async (req, res) => {
    try {
        const { electionId } = req.params;
        const election = await Election.findByPk(electionId);
        if (!election) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        const runoff = await runoffService.calculateRunoff(election);
        return res.json({
            success: true,
            election_id: election.election_id,
            runoff,
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to compute runoff', message: error.message });
    }
});

/**
 * GET /api/v1/results/:electionId/export
 * Export election results as CSV (authenticated)
 */
router.get('/:electionId/export', authenticate, resultsLimiter, async (req, res) => {
    try {
        const { electionId } = req.params;

        const election = await Election.findByPk(electionId, {
            include: [{
                model: Candidate,
                as: 'candidates',
            }],
        });

        if (!election) {
            return res.status(404).json({
                success: false,
                error: 'Election not found',
            });
        }

        // Fetch results
        let results = [];
        try {
            results = await fabricService.getResults(electionId);
        } catch (blockchainError) {
            console.error('Blockchain results error:', blockchainError.message);
        }

        // Generate CSV
        const csvHeader = 'Candidate ID,Candidate Name,Party,Party Symbol,Vote Count\n';
        const csvRows = election.candidates.map(candidate => {
            const result = results.find(r => r.candidateId === candidate.candidate_id);
            const voteCount = result ? result.voteCount : 0;
            return `${candidate.candidate_id},"${candidate.full_name}","${candidate.party_name}","${candidate.party_symbol}",${voteCount}`;
        }).join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${election.name}_results_${Date.now()}.csv"`);
        res.send(csv);

    } catch (error) {
        console.error('Export results error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to export results',
            message: error.message,
        });
    }
});

module.exports = router;
