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
const VoteSagaStatus = require('./voteSagaStatus.model.js');
const CandidateApplication = require('./candidateApplication.model.js');
const PollingBooth = require('./pollingBooth.model.js');
const SupervisorAssignment = require('./supervisorAssignment.model.js');
const BoothDeviceAssignment = require('./boothDeviceAssignment.model.js');
const BoothSession = require('./boothSession.model.js');
const BallotToken = require('./ballotToken.model.js');
const ManualOverrideRequest = require('./manualOverrideRequest.model.js');
const VoteAttempt = require('./voteAttempt.model.js');
const CustodyEvent = require('./custodyEvent.model.js');

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

Candidate.hasMany(VotingRecord, {
    foreignKey: 'candidate_id',
    as: 'votes',
});
VotingRecord.belongsTo(Candidate, {
    foreignKey: 'candidate_id',
    as: 'candidate',
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

VotingRecord.hasOne(VoteSagaStatus, {
    foreignKey: 'vote_id',
    sourceKey: 'record_id',
    as: 'saga_status',
    constraints: false,
});
VoteSagaStatus.belongsTo(VotingRecord, {
    foreignKey: 'vote_id',
    targetKey: 'record_id',
    as: 'voting_record',
    constraints: false,
});

Election.hasMany(CandidateApplication, {
    foreignKey: 'election_id',
    as: 'candidate_applications',
});
CandidateApplication.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

Election.hasMany(PollingBooth, {
    foreignKey: 'election_id',
    as: 'polling_booths',
});
PollingBooth.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

District.hasMany(PollingBooth, {
    foreignKey: 'district_id',
    as: 'polling_booths',
});
PollingBooth.belongsTo(District, {
    foreignKey: 'district_id',
    as: 'district',
});

AdminUser.hasMany(PollingBooth, {
    foreignKey: 'created_by',
    as: 'created_booths',
});
PollingBooth.belongsTo(AdminUser, {
    foreignKey: 'created_by',
    as: 'created_by_admin',
});

Election.hasMany(SupervisorAssignment, {
    foreignKey: 'election_id',
    as: 'supervisor_assignments',
});
SupervisorAssignment.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

PollingBooth.hasMany(SupervisorAssignment, {
    foreignKey: 'booth_id',
    as: 'supervisor_assignments',
});
SupervisorAssignment.belongsTo(PollingBooth, {
    foreignKey: 'booth_id',
    as: 'booth',
});

AdminUser.hasMany(SupervisorAssignment, {
    foreignKey: 'supervisor_admin_id',
    as: 'supervisor_assignments',
});
SupervisorAssignment.belongsTo(AdminUser, {
    foreignKey: 'supervisor_admin_id',
    as: 'supervisor',
});

Election.hasMany(BoothDeviceAssignment, {
    foreignKey: 'election_id',
    as: 'booth_device_assignments',
});
BoothDeviceAssignment.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

PollingBooth.hasMany(BoothDeviceAssignment, {
    foreignKey: 'booth_id',
    as: 'device_assignments',
});
BoothDeviceAssignment.belongsTo(PollingBooth, {
    foreignKey: 'booth_id',
    as: 'booth',
});

Election.hasMany(BoothSession, {
    foreignKey: 'election_id',
    as: 'booth_sessions',
});
BoothSession.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

PollingBooth.hasMany(BoothSession, {
    foreignKey: 'booth_id',
    as: 'sessions',
});
BoothSession.belongsTo(PollingBooth, {
    foreignKey: 'booth_id',
    as: 'booth',
});

AdminUser.hasMany(BoothSession, {
    foreignKey: 'supervisor_admin_id',
    as: 'booth_sessions',
});
BoothSession.belongsTo(AdminUser, {
    foreignKey: 'supervisor_admin_id',
    as: 'supervisor',
});

Election.hasMany(BallotToken, {
    foreignKey: 'election_id',
    as: 'ballot_tokens',
});
BallotToken.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

Voter.hasMany(BallotToken, {
    foreignKey: 'voter_id',
    as: 'ballot_tokens',
});
BallotToken.belongsTo(Voter, {
    foreignKey: 'voter_id',
    as: 'voter',
});

BoothSession.hasMany(BallotToken, {
    foreignKey: 'booth_session_id',
    as: 'ballot_tokens',
});
BallotToken.belongsTo(BoothSession, {
    foreignKey: 'booth_session_id',
    as: 'booth_session',
});

Election.hasMany(ManualOverrideRequest, {
    foreignKey: 'election_id',
    as: 'manual_override_requests',
});
ManualOverrideRequest.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

BoothSession.hasMany(ManualOverrideRequest, {
    foreignKey: 'booth_session_id',
    as: 'manual_override_requests',
});
ManualOverrideRequest.belongsTo(BoothSession, {
    foreignKey: 'booth_session_id',
    as: 'booth_session',
});

Voter.hasMany(ManualOverrideRequest, {
    foreignKey: 'voter_id',
    as: 'manual_override_requests',
});
ManualOverrideRequest.belongsTo(Voter, {
    foreignKey: 'voter_id',
    as: 'voter',
});

Election.hasMany(VoteAttempt, {
    foreignKey: 'election_id',
    as: 'vote_attempts',
});
VoteAttempt.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

Voter.hasMany(VoteAttempt, {
    foreignKey: 'voter_id',
    as: 'vote_attempts',
});
VoteAttempt.belongsTo(Voter, {
    foreignKey: 'voter_id',
    as: 'voter',
});

BoothSession.hasMany(VoteAttempt, {
    foreignKey: 'booth_session_id',
    as: 'vote_attempts',
});
VoteAttempt.belongsTo(BoothSession, {
    foreignKey: 'booth_session_id',
    as: 'booth_session',
});

Election.hasMany(CustodyEvent, {
    foreignKey: 'election_id',
    as: 'custody_events',
});
CustodyEvent.belongsTo(Election, {
    foreignKey: 'election_id',
    as: 'election',
});

PollingBooth.hasMany(CustodyEvent, {
    foreignKey: 'booth_id',
    as: 'custody_events',
});
CustodyEvent.belongsTo(PollingBooth, {
    foreignKey: 'booth_id',
    as: 'booth',
});

AdminUser.hasMany(CustodyEvent, {
    foreignKey: 'actor_admin_id',
    as: 'custody_events',
});
CustodyEvent.belongsTo(AdminUser, {
    foreignKey: 'actor_admin_id',
    as: 'actor',
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
    VoteSagaStatus,
    CandidateApplication,
    PollingBooth,
    SupervisorAssignment,
    BoothDeviceAssignment,
    BoothSession,
    BallotToken,
    ManualOverrideRequest,
    VoteAttempt,
    CustodyEvent,
};
