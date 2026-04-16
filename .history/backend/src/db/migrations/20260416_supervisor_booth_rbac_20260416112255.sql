-- =============================================
-- Migration: Supervisor booth operations + RBAC + eligibility dimensions
-- Date: 2026-04-16
-- =============================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------
-- 1) Expand admin role check to include SUPERVISOR and AUDITOR roles
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_users_role_check'
    ) THEN
        ALTER TABLE admin_users DROP CONSTRAINT admin_users_role_check;
    END IF;

    ALTER TABLE admin_users
    ADD CONSTRAINT admin_users_role_check
    CHECK (role IN (
        'SUPER_ADMIN',
        'ELECTION_OFFICER',
        'TECHNICAL_ADMIN',
        'OBSERVER',
        'SUPERVISOR',
        'AUDITOR'
    ));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- -----------------------------------------------------------------
-- 2) Expand election state check for supervised polling lifecycle
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'elections_status_check'
    ) THEN
        ALTER TABLE elections DROP CONSTRAINT elections_status_check;
    END IF;

    ALTER TABLE elections
    ADD CONSTRAINT elections_status_check
    CHECK (status IN (
        'DRAFT',
        'REGISTRATION_OPEN',
        'REGISTRATION_CLOSED',
        'ELIGIBILITY_FROZEN',
        'READY_FOR_POLLING',
        'ACTIVE_POLLING',
        'PAUSED',
        'POLLING_CLOSED',
        'TALLYING',
        'AUDITING',
        'CERTIFIED',
        'ARCHIVED',
        'PENDING',
        'ACTIVE',
        'COMPLETED',
        'CANCELLED'
    ));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- -----------------------------------------------------------------
-- 3) Eligibility dimensions for students and voters
-- -----------------------------------------------------------------
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS section VARCHAR(20),
    ADD COLUMN IF NOT EXISTS class_name VARCHAR(50),
    ADD COLUMN IF NOT EXISTS academic_year INTEGER,
    ADD COLUMN IF NOT EXISTS semester INTEGER;

ALTER TABLE voters
    ADD COLUMN IF NOT EXISTS section VARCHAR(20),
    ADD COLUMN IF NOT EXISTS class_name VARCHAR(50),
    ADD COLUMN IF NOT EXISTS academic_year INTEGER;

CREATE INDEX IF NOT EXISTS idx_students_section ON students(section);
CREATE INDEX IF NOT EXISTS idx_students_class_name ON students(class_name);
CREATE INDEX IF NOT EXISTS idx_students_academic_year ON students(academic_year);
CREATE INDEX IF NOT EXISTS idx_voters_section ON voters(section);
CREATE INDEX IF NOT EXISTS idx_voters_class_name ON voters(class_name);
CREATE INDEX IF NOT EXISTS idx_voters_academic_year ON voters(academic_year);

-- -----------------------------------------------------------------
-- 4) Polling booths for election-specific supervised operations
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS polling_booths (
    booth_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    district_id UUID REFERENCES districts(district_id) ON DELETE SET NULL,
    booth_code VARCHAR(80) NOT NULL,
    venue_name VARCHAR(255) NOT NULL,
    room_label VARCHAR(100),
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    status VARCHAR(40) NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'READY', 'ACTIVE', 'PAUSED', 'CLOSED', 'DISABLED')),
    created_by UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (election_id, booth_code)
);

CREATE INDEX IF NOT EXISTS idx_polling_booths_election_id ON polling_booths(election_id);
CREATE INDEX IF NOT EXISTS idx_polling_booths_district_id ON polling_booths(district_id);
CREATE INDEX IF NOT EXISTS idx_polling_booths_status ON polling_booths(status);

-- -----------------------------------------------------------------
-- 5) Supervisor assignments to election/booth scope
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supervisor_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    booth_id UUID NOT NULL REFERENCES polling_booths(booth_id) ON DELETE CASCADE,
    supervisor_admin_id UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    assignment_start TIMESTAMP NOT NULL,
    assignment_end TIMESTAMP NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'REVOKED', 'EXPIRED')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_supervisor_assignment_window CHECK (assignment_end > assignment_start)
);

CREATE INDEX IF NOT EXISTS idx_supervisor_assignments_election_id ON supervisor_assignments(election_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_assignments_booth_id ON supervisor_assignments(booth_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_assignments_supervisor_admin_id ON supervisor_assignments(supervisor_admin_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_assignments_status ON supervisor_assignments(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supervisor_assignments_active_scope
ON supervisor_assignments(election_id, booth_id, supervisor_admin_id)
WHERE status = 'ACTIVE';

-- -----------------------------------------------------------------
-- 6) Device assignment to booth for election period
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booth_device_assignments (
    booth_device_assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    booth_id UUID NOT NULL REFERENCES polling_booths(booth_id) ON DELETE CASCADE,
    terminal_id UUID NOT NULL REFERENCES iot_terminals(terminal_id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP,
    status VARCHAR(40) NOT NULL DEFAULT 'ASSIGNED'
        CHECK (status IN ('ASSIGNED', 'RELEASED', 'FAILED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT check_device_release_time CHECK (released_at IS NULL OR released_at >= assigned_at)
);

CREATE INDEX IF NOT EXISTS idx_booth_device_assignments_election_id ON booth_device_assignments(election_id);
CREATE INDEX IF NOT EXISTS idx_booth_device_assignments_booth_id ON booth_device_assignments(booth_id);
CREATE INDEX IF NOT EXISTS idx_booth_device_assignments_terminal_id ON booth_device_assignments(terminal_id);
CREATE INDEX IF NOT EXISTS idx_booth_device_assignments_status ON booth_device_assignments(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_terminal_per_election
ON booth_device_assignments(election_id, terminal_id)
WHERE status = 'ASSIGNED';

-- -----------------------------------------------------------------
-- 7) Live booth sessions (supervisor managed)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booth_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    booth_id UUID NOT NULL REFERENCES polling_booths(booth_id) ON DELETE RESTRICT,
    terminal_id UUID REFERENCES iot_terminals(terminal_id) ON DELETE SET NULL,
    supervisor_admin_id UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE RESTRICT,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'PAUSED', 'STOPPED', 'ABORTED')),
    start_reason_code VARCHAR(80),
    stop_reason_code VARCHAR(80),
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_booth_session_time CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_booth_sessions_election_id ON booth_sessions(election_id);
CREATE INDEX IF NOT EXISTS idx_booth_sessions_booth_id ON booth_sessions(booth_id);
CREATE INDEX IF NOT EXISTS idx_booth_sessions_terminal_id ON booth_sessions(terminal_id);
CREATE INDEX IF NOT EXISTS idx_booth_sessions_supervisor_admin_id ON booth_sessions(supervisor_admin_id);
CREATE INDEX IF NOT EXISTS idx_booth_sessions_status ON booth_sessions(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booth_session
ON booth_sessions(election_id, booth_id)
WHERE status IN ('ACTIVE', 'PAUSED');

-- -----------------------------------------------------------------
-- 8) Ballot tokens for one-time vote issuance
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ballot_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES voters(voter_id) ON DELETE RESTRICT,
    booth_session_id UUID NOT NULL REFERENCES booth_sessions(session_id) ON DELETE CASCADE,
    terminal_id UUID REFERENCES iot_terminals(terminal_id) ON DELETE SET NULL,
    issued_by_admin_id UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    status VARCHAR(40) NOT NULL DEFAULT 'ISSUED'
        CHECK (status IN ('ISSUED', 'CONSUMED', 'EXPIRED', 'REVOKED')),
    reason_code VARCHAR(80),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT check_ballot_token_expiry CHECK (expires_at > issued_at),
    CONSTRAINT check_ballot_token_consumed_time CHECK (consumed_at IS NULL OR consumed_at >= issued_at)
);

CREATE INDEX IF NOT EXISTS idx_ballot_tokens_election_id ON ballot_tokens(election_id);
CREATE INDEX IF NOT EXISTS idx_ballot_tokens_voter_id ON ballot_tokens(voter_id);
CREATE INDEX IF NOT EXISTS idx_ballot_tokens_booth_session_id ON ballot_tokens(booth_session_id);
CREATE INDEX IF NOT EXISTS idx_ballot_tokens_status ON ballot_tokens(status);
CREATE INDEX IF NOT EXISTS idx_ballot_tokens_expires_at ON ballot_tokens(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_ballot_token_per_voter
ON ballot_tokens(election_id, voter_id)
WHERE status = 'ISSUED';

-- -----------------------------------------------------------------
-- 9) Manual verification and override requests
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_override_requests (
    override_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    booth_session_id UUID NOT NULL REFERENCES booth_sessions(session_id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES voters(voter_id) ON DELETE RESTRICT,
    requested_by_admin_id UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE RESTRICT,
    approved_by_admin_id UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    reason_code VARCHAR(80) NOT NULL,
    details TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING_APPROVAL'
        CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT check_override_resolution_time CHECK (resolved_at IS NULL OR resolved_at >= requested_at)
);

CREATE INDEX IF NOT EXISTS idx_manual_override_requests_election_id ON manual_override_requests(election_id);
CREATE INDEX IF NOT EXISTS idx_manual_override_requests_booth_session_id ON manual_override_requests(booth_session_id);
CREATE INDEX IF NOT EXISTS idx_manual_override_requests_voter_id ON manual_override_requests(voter_id);
CREATE INDEX IF NOT EXISTS idx_manual_override_requests_status ON manual_override_requests(status);

-- -----------------------------------------------------------------
-- 10) Verification and vote attempt ledger
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vote_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    voter_id UUID REFERENCES voters(voter_id) ON DELETE SET NULL,
    booth_session_id UUID REFERENCES booth_sessions(session_id) ON DELETE SET NULL,
    terminal_id UUID REFERENCES iot_terminals(terminal_id) ON DELETE SET NULL,
    attempt_type VARCHAR(50) NOT NULL
        CHECK (attempt_type IN ('VERIFICATION', 'BALLOT_ISSUE', 'VOTE_CAST')),
    outcome VARCHAR(50) NOT NULL
        CHECK (outcome IN (
            'VERIFIED',
            'INELIGIBLE',
            'DUPLICATE',
            'BIOMETRIC_FAIL',
            'TOKEN_EXPIRED',
            'VOTE_CAST',
            'REJECTED',
            'ERROR'
        )),
    reason_code VARCHAR(80),
    metadata JSONB DEFAULT '{}'::jsonb,
    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vote_attempts_election_id ON vote_attempts(election_id);
CREATE INDEX IF NOT EXISTS idx_vote_attempts_voter_id ON vote_attempts(voter_id);
CREATE INDEX IF NOT EXISTS idx_vote_attempts_session_id ON vote_attempts(booth_session_id);
CREATE INDEX IF NOT EXISTS idx_vote_attempts_terminal_id ON vote_attempts(terminal_id);
CREATE INDEX IF NOT EXISTS idx_vote_attempts_attempted_at ON vote_attempts(attempted_at DESC);

-- -----------------------------------------------------------------
-- 11) Chain-of-custody events for supervised polling
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custody_events (
    custody_event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    booth_id UUID REFERENCES polling_booths(booth_id) ON DELETE SET NULL,
    terminal_id UUID REFERENCES iot_terminals(terminal_id) ON DELETE SET NULL,
    actor_admin_id UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL
        CHECK (event_type IN (
            'DEVICE_HANDOVER',
            'DEVICE_SEAL_APPLIED',
            'DEVICE_SEAL_BROKEN',
            'SESSION_STARTED',
            'SESSION_PAUSED',
            'SESSION_RESUMED',
            'SESSION_STOPPED',
            'INCIDENT_REPORTED',
            'OVERRIDE_APPROVED',
            'OVERRIDE_REJECTED',
            'TAMPER_ALERT'
        )),
    event_hash VARCHAR(128) NOT NULL UNIQUE,
    prev_event_hash VARCHAR(128),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custody_events_election_id ON custody_events(election_id);
CREATE INDEX IF NOT EXISTS idx_custody_events_booth_id ON custody_events(booth_id);
CREATE INDEX IF NOT EXISTS idx_custody_events_terminal_id ON custody_events(terminal_id);
CREATE INDEX IF NOT EXISTS idx_custody_events_actor_admin_id ON custody_events(actor_admin_id);
CREATE INDEX IF NOT EXISTS idx_custody_events_created_at ON custody_events(created_at DESC);

COMMIT;
