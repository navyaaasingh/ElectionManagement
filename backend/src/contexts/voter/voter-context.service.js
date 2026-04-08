const { Voter, Student } = require('../../models/index.js');

class VoterContextService {
    async findVoterById(voterId, options = {}) {
        return Voter.findByPk(voterId, options);
    }

    async createVoter(payload, options = {}) {
        return Voter.create(payload, options);
    }

    async listStudents(where = {}, options = {}) {
        return Student.findAll({
            where,
            ...options,
        });
    }
}

module.exports = new VoterContextService();
