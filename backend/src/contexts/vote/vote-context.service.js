const voteService = require('../../services/voteService.js');
const reconciliationSaga = require('../../services/reconciliationSaga.service.js');
const { VotingRecord, VoteNonce, OutboxEvent, DeadLetterEvent } = require('../../models/index.js');

class VoteContextService {
    async castVote(payload) {
        return voteService.castVote(payload);
    }

    async verifyReceipt(receiptId) {
        return voteService.verifyReceipt(receiptId);
    }

    async getVotingRecord(where = {}, options = {}) {
        return VotingRecord.findOne({ where, ...options });
    }

    async enqueueVoteSync(payload, transaction = null) {
        return reconciliationSaga.enqueueVoteSync(payload, transaction);
    }

    async getQueueDepth() {
        const [pendingOutbox, pendingDeadLetter] = await Promise.all([
            OutboxEvent.count({ where: { status: 'PENDING' } }),
            DeadLetterEvent.count({ where: { resolved: false } }),
        ]);
        return { pendingOutbox, pendingDeadLetter };
    }

    getModels() {
        return { VotingRecord, VoteNonce, OutboxEvent, DeadLetterEvent };
    }
}

module.exports = new VoteContextService();
