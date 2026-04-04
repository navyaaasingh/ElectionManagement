const Voter = require('./voter.model.js');
const VoterPasskey = require('./voterPasskey.model.js');
const Election = require('./election.model.js');
const Candidate = require('./candidate.model.js');
const VotingRecord = require('./votingRecord.model.js');
const AuditLog = require('./auditLog.model.js');
const Student = require('./student.model.js');
const District = require('./district.model.js');

// Define relationships
Voter.hasMany(VoterPasskey, {
    foreignKey: 'voter_id',
    as: 'passkeys',
});
VoterPasskey.belongsTo(Voter, {
    foreignKey: 'voter_id',
    as: 'voter',
});

Election.hasMany(Candidate, {
    foreignKey: 'election_id',
    as: 'candidates',
});
Candidate.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

// District associations
District.hasMany(Candidate, {
    foreignKey: 'district_id',
    as: 'candidates',
});
Candidate.belongsTo(District, {
    foreignKey: 'district_id',
    as: 'district',
});

District.hasMany(Voter, {
    foreignKey: 'district_id',
    as: 'voters',
});
Voter.belongsTo(District, {
    foreignKey: 'district_id',
    as: 'district',
});

Election.hasMany(VotingRecord, {
    foreignKey: 'election_id',
    as: 'voting_records',
});
VotingRecord.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

Voter.hasMany(VotingRecord, {
    foreignKey: 'voter_id',
    as: 'voting_records',
});
VotingRecord.belongsTo(Voter, {
    foreignKey: 'voter_id',
    as: 'voter',
});

module.exports = {
    Voter,
    VoterPasskey,
    Election,
    Candidate,
    VotingRecord,
    AuditLog,
    Student,
    District,
};
