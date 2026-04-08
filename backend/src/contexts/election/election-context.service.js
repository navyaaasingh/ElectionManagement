const { Election, Candidate, PollApproval } = require('../../models/index.js');

class ElectionContextService {
    async findElectionById(electionId, options = {}) {
        return Election.findByPk(electionId, options);
    }

    async createElection(payload, options = {}) {
        return Election.create(payload, options);
    }

    async listCandidates(where = {}, options = {}) {
        return Candidate.findAll({
            where,
            ...options,
        });
    }

    async createPollApproval(payload, options = {}) {
        return PollApproval.create(payload, options);
    }
}

module.exports = new ElectionContextService();
