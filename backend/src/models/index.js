const Voter = require('./voter.model.js');
const VoterPasskey = require('./voterPasskey.model.js');
const Election = require('./election.model.js');
const Candidate = require('./candidate.model.js');
const VotingRecord = require('./votingRecord.model.js');
const AuditLog = require('./auditLog.model.js');
const Student = require('./student.model.js');
const District = require('./district.model.js');
const AdminUser = require('./adminUser.model.js');
const VoteNonce = require('./voteNonce.model.js');
const PollApproval = require('./pollApproval.model.js');
const OutboxEvent = require('./outboxEvent.model.js');
const DeadLetterEvent = require('./deadLetterEvent.model.js');

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

AdminUser.hasMany(Student, {
    foreignKey: 'admin_id',
    as: 'students',
});
Student.belongsTo(AdminUser, {
    foreignKey: 'admin_id',
    as: 'admin',
});

AdminUser.hasMany(Voter, {
    foreignKey: 'admin_id',
    as: 'voters',
});
Voter.belongsTo(AdminUser, {
    foreignKey: 'admin_id',
    as: 'admin',
});

AdminUser.hasMany(Election, {
    foreignKey: 'created_by_admin_id',
    as: 'elections',
});
Election.belongsTo(AdminUser, {
    foreignKey: 'created_by_admin_id',
    as: 'created_by_admin',
});

Election.hasMany(PollApproval, {
    foreignKey: 'election_id',
    as: 'poll_approvals',
});
PollApproval.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
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

Voter.hasMany(VoteNonce, {
    foreignKey: 'voter_id',
    as: 'vote_nonces',
});
VoteNonce.belongsTo(Voter, {
    foreignKey: 'voter_id',
    as: 'voter',
});

Election.hasMany(VoteNonce, {
    foreignKey: 'election_id',
    as: 'vote_nonces',
});
VoteNonce.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

VotingRecord.hasMany(OutboxEvent, {
    foreignKey: 'aggregate_id',
    sourceKey: 'record_id',
    as: 'outbox_events',
    constraints: false,
});
OutboxEvent.belongsTo(VotingRecord, {
    foreignKey: 'aggregate_id',
    targetKey: 'record_id',
    as: 'voting_record',
    constraints: false,
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
    AdminUser,
    VoteNonce,
    PollApproval,
    OutboxEvent,
    DeadLetterEvent,
};
