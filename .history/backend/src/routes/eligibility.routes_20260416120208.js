const express = require('express');
const { Op } = require('sequelize');
const { Election, Voter } = require('../models/index.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');
const eligibilityService = require('../services/eligibilityService.js');

const router = express.Router();

const canManageElection = (req, election) => {
    if (!election) return false;
    if (req.user?.adminRole === 'SUPER_ADMIN') return true;
    return req.user?.adminId && election.created_by_admin_id === req.user.adminId;
};

const buildPolicyRules = (body = {}) => {
    if (body.rules && typeof body.rules === 'object') {
        return body.rules;
    }

    const {
        electionId,
        name,
        description,
        versionNote,
        ...ruleFields
    } = body;

    return ruleFields;
};

const buildPolicySnapshot = ({ existingRules, incomingRules, req, policyId, name, description, versionNote }) => {
    const existingMeta = existingRules?.__meta || {};
    const version = Number(existingMeta.version || 0) + 1;

    return {
        ...incomingRules,
        __meta: {
            policyId,
            name: name || existingMeta.name || 'default-eligibility-policy',
            description: description || existingMeta.description || '',
            version,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user?.adminId || null,
            versionNote: versionNote || null,
        },
    };
};

/**
 * GET /api/v1/eligibility/policies?electionId=:id
 */
router.get('/policies', authenticate, authorize('admin', 'auditor'), async (req, res) => {
    try {
        const { electionId } = req.query;
        if (!electionId) {
            return res.status(400).json({ success: false, error: 'electionId query parameter is required' });
        }

        const election = await Election.findByPk(electionId);
        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });

        if (!canManageElection(req, election) && req.user.role !== 'auditor') {
            return res.status(403).json({ success: false, error: 'Not authorized to view this election policy' });
        }

        const rules = election.eligibility_rules || {};
        return res.json({
            success: true,
            data: {
                electionId: election.election_id,
                policyId: rules.__meta?.policyId || `eligibility-${election.election_id}-v0`,
                metadata: rules.__meta || null,
                rules,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to fetch eligibility policy', message: error.message });
    }
});

/**
 * POST /api/v1/eligibility/policies
 */
router.post('/policies', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { electionId, name, description, versionNote } = req.body || {};
        if (!electionId) {
            return res.status(400).json({ success: false, error: 'electionId is required' });
        }

        const election = await Election.findByPk(electionId);
        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });

        if (!canManageElection(req, election)) {
            return res.status(403).json({ success: false, error: 'Not authorized to manage this election policy' });
        }

        const incomingRules = buildPolicyRules(req.body);
        const validation = eligibilityService.validateRules(incomingRules);
        if (!validation.valid) {
            return res.status(422).json({ success: false, error: 'Eligibility rule validation failed', details: validation.errors });
        }

        const policyId = `eligibility-${election.election_id}`;
        const policySnapshot = buildPolicySnapshot({
            existingRules: election.eligibility_rules,
            incomingRules,
            req,
            policyId,
            name,
            description,
            versionNote,
        });

        await election.update({ eligibility_rules: policySnapshot });

        return res.status(201).json({
            success: true,
            message: 'Eligibility policy created',
            data: {
                policyId,
                version: policySnapshot.__meta.version,
                rules: policySnapshot,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to create eligibility policy', message: error.message });
    }
});

/**
 * PUT /api/v1/eligibility/policies/:policyId
 */
router.put('/policies/:policyId', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { policyId } = req.params;
        const { electionId, name, description, versionNote } = req.body || {};

        if (!electionId) {
            return res.status(400).json({ success: false, error: 'electionId is required' });
        }

        const election = await Election.findByPk(electionId);
        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });

        if (!canManageElection(req, election)) {
            return res.status(403).json({ success: false, error: 'Not authorized to manage this election policy' });
        }

        const incomingRules = buildPolicyRules(req.body);
        const validation = eligibilityService.validateRules(incomingRules);
        if (!validation.valid) {
            return res.status(422).json({ success: false, error: 'Eligibility rule validation failed', details: validation.errors });
        }

        const currentPolicyId = election.eligibility_rules?.__meta?.policyId;
        if (currentPolicyId && currentPolicyId !== policyId) {
            return res.status(409).json({
                success: false,
                error: `Policy id mismatch. Current policy is ${currentPolicyId}`,
            });
        }

        const policySnapshot = buildPolicySnapshot({
            existingRules: election.eligibility_rules,
            incomingRules,
            req,
            policyId,
            name,
            description,
            versionNote,
        });

        await election.update({ eligibility_rules: policySnapshot });

        return res.json({
            success: true,
            message: 'Eligibility policy updated',
            data: {
                policyId,
                version: policySnapshot.__meta.version,
                rules: policySnapshot,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to update eligibility policy', message: error.message });
    }
});

/**
 * POST /api/v1/eligibility/bulk-validate
 */
router.post('/bulk-validate', authenticate, authorize('admin', 'auditor'), csrfProtection, async (req, res) => {
    try {
        const { electionId, voterIds, limit = 500 } = req.body || {};
        if (!electionId) {
            return res.status(400).json({ success: false, error: 'electionId is required' });
        }

        const election = await Election.findByPk(electionId);
        if (!election) return res.status(404).json({ success: false, error: 'Election not found' });

        if (!canManageElection(req, election) && req.user.role !== 'auditor') {
            return res.status(403).json({ success: false, error: 'Not authorized to validate this election policy' });
        }

        const where = {};
        if (Array.isArray(voterIds) && voterIds.length > 0) {
            where.voter_id = { [Op.in]: voterIds };
        }

        const voters = await Voter.findAll({
            where,
            limit: Math.min(Number(limit) || 500, 2000),
            order: [['voter_id', 'ASC']],
        });

        const evaluations = [];
        const reasonHistogram = {};
        let eligible = 0;
        let ineligible = 0;

        for (const voter of voters) {
            const result = await eligibilityService.evaluateVoter(voter, election, {
                districtId: voter.district_id,
            });

            if (result.eligible) {
                eligible += 1;
            } else {
                ineligible += 1;
                for (const reason of result.reasons) {
                    reasonHistogram[reason] = (reasonHistogram[reason] || 0) + 1;
                }
            }

            evaluations.push({
                voterId: voter.voter_id,
                eligible: result.eligible,
                reasons: result.reasons,
            });
        }

        return res.json({
            success: true,
            data: {
                electionId,
                totalEvaluated: voters.length,
                eligible,
                ineligible,
                reasonHistogram,
                evaluations,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to run bulk eligibility validation', message: error.message });
    }
});

module.exports = router;
