const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { CONTEXT_SCHEMAS } = require('../contexts/context.config.js');
const voteContextService = require('../contexts/vote/vote-context.service.js');

const router = express.Router();

router.get('/health', authenticate, authorize('admin', 'observer'), async (req, res) => {
    try {
        const queueDepth = await voteContextService.getQueueDepth();
        res.json({
            success: true,
            boundedContexts: {
                voter: CONTEXT_SCHEMAS.voter,
                election: CONTEXT_SCHEMAS.election,
                vote: CONTEXT_SCHEMAS.vote,
            },
            queueDepth,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to read bounded context health', message: error.message });
    }
});

module.exports = router;
