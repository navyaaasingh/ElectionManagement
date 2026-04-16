-- ===================================
-- Election Management System Database Schema
-- PostgreSQL 16
-- ===================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables to make migration idempotent
DROP TABLE IF EXISTS system_config CASCADE;
DROP TABLE IF EXISTS fraud_alerts CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS iot_terminals CASCADE;
DROP TABLE IF EXISTS voting_records CASCADE;
DROP TABLE IF EXISTS voters CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS elections CASCADE;
DROP TABLE IF EXISTS districts CASCADE;

-- ===================================
-- TABLE: districts
-- ===================================
CREATE TABLE districts (
    district_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    state VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    population INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_districts_state ON districts(state);

-- ===================================
-- TABLE: elections
-- ===================================
CREATE TABLE elections (
    election_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    election_type VARCHAR(50) NOT NULL CHECK (election_type IN ('NATIONAL', 'STATE', 'LOCAL', 'INSTITUTIONAL')),
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_election_dates CHECK (end_date > start_date)
);

CREATE INDEX idx_elections_status ON elections(status);
CREATE INDEX idx_elections_dates ON elections(start_date, end_date);

-- ===================================
-- TABLE: candidates
-- ===================================
CREATE TABLE candidates (
    candidate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    district_id UUID REFERENCES districts(district_id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    party_name VARCHAR(255),
    party_symbol VARCHAR(255),
    candidate_photo TEXT,
    position_title VARCHAR(100) DEFAULT 'Candidate',
    biography TEXT,
    manifesto_summary TEXT,
    votes_received INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'disqualified')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidates_election ON candidates(election_id);
CREATE INDEX idx_candidates_district ON candidates(district_id);

-- ===================================
-- TABLE: voters
-- ===================================
CREATE TABLE voters (
    voter_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roll_number VARCHAR(20) UNIQUE,
    aadhar_number VARCHAR(12) UNIQUE NOT NULL,
    biometric_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash of biometric data
    district_id UUID NOT NULL REFERENCES districts(district_id) ON DELETE RESTRICT,
    full_name VARCHAR(255) NOT NULL,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'deceased')),
    has_voted BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    is_biometric_registered BOOLEAN DEFAULT false,
    aadhaar_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    admin_id UUID,
    device_id VARCHAR(255),
    date_of_birth DATE,
    party_affiliation VARCHAR(100),
    state VARCHAR(100),
    location_meta JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_voters_district ON voters(district_id);
CREATE INDEX idx_voters_biometric_hash ON voters(biometric_hash);
CREATE INDEX idx_voters_aadhar_number ON voters(aadhar_number);

-- ===================================
-- TABLE: iot_terminals
-- ===================================
CREATE TABLE iot_terminals (
    terminal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mac_address VARCHAR(17) UNIQUE NOT NULL,
    district_id UUID REFERENCES districts(district_id) ON DELETE SET NULL,
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'COMPROMISED')),
    firmware_version VARCHAR(50),
    last_heartbeat TIMESTAMP,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_terminals_district ON iot_terminals(district_id);
CREATE INDEX idx_terminals_status ON iot_terminals(status);
CREATE INDEX idx_terminals_mac ON iot_terminals(mac_address);

-- ===================================
-- TABLE: voting_records
-- ===================================
CREATE TABLE voting_records (
    record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voter_id UUID NOT NULL REFERENCES voters(voter_id) ON DELETE RESTRICT,
    election_id UUID NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
    terminal_id UUID NOT NULL REFERENCES iot_terminals(terminal_id),
    vote_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    verification_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voter_id, election_id)
);

CREATE INDEX idx_voting_records_voter ON voting_records(voter_id);
CREATE INDEX idx_voting_records_election ON voting_records(election_id);
CREATE INDEX idx_voting_records_terminal ON voting_records(terminal_id);
CREATE INDEX idx_voting_records_vote_timestamp ON voting_records(vote_timestamp);
CREATE INDEX idx_voting_records_blockchain_tx ON voting_records(blockchain_tx_id);

-- ===================================
-- TABLE: admin_users
-- ===================================
CREATE TABLE admin_users (
    admin_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
    role VARCHAR(50) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ELECTION_OFFICER', 'TECHNICAL_ADMIN', 'OBSERVER')),
    district_id UUID REFERENCES districts(district_id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_users_username ON admin_users(username);
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- ===================================
-- TABLE: audit_logs (PostgreSQL side)
-- ===================================
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) CHECK (event_category IN ('AUTHENTICATION', 'VOTING', 'ADMINISTRATION', 'SYSTEM', 'SECURITY')),
    user_id UUID,
    user_type VARCHAR(50) CHECK (user_type IN ('VOTER', 'ADMIN', 'SYSTEM', 'IOT_TERMINAL')),
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    severity VARCHAR(20) CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_category ON audit_logs(event_category);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);

-- ===================================
-- TABLE: fraud_alerts
-- ===================================
CREATE TABLE fraud_alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT NOT NULL,
    election_id UUID REFERENCES elections(election_id) ON DELETE CASCADE,
    district_id UUID REFERENCES districts(district_id) ON DELETE SET NULL,
    terminal_id UUID REFERENCES iot_terminals(terminal_id) ON DELETE SET NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE')),
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    resolution_notes TEXT,
    ml_confidence DECIMAL(5,4), -- ML model confidence score
    metadata JSONB
);

CREATE INDEX idx_fraud_alerts_election ON fraud_alerts(election_id);
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(severity);
CREATE INDEX idx_fraud_alerts_status ON fraud_alerts(status);
CREATE INDEX idx_fraud_alerts_detected_at ON fraud_alerts(detected_at DESC);

-- ===================================
-- TABLE: system_config
-- ===================================
CREATE TABLE system_config (
    config_key VARCHAR(255) PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    updated_by UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================
-- FUNCTIONS: Update timestamp trigger
-- ===================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_districts_updated_at BEFORE UPDATE ON districts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_elections_updated_at BEFORE UPDATE ON elections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_voters_updated_at BEFORE UPDATE ON voters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_terminals_updated_at BEFORE UPDATE ON iot_terminals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===================================
-- SEED DATA
-- ===================================

-- Insert sample districts
INSERT INTO districts (name, state, country) VALUES
('District 001', 'Maharashtra', 'India'),
('District 002', 'Karnataka', 'India'),
('District 003', 'Tamil Nadu', 'India');

-- Insert default system config
INSERT INTO system_config (config_key, config_value, description) VALUES
('system_name', 'Secure Election Management System', 'System display name'),
('version', '1.0.0', 'Current system version'),
('maintenance_mode', 'false', 'System maintenance mode flag'),
('max_votes_per_second', '10000', 'Maximum votes processed per second threshold'),
('fraud_detection_enabled', 'true', 'Enable ML-based fraud detection');

-- ===================================
-- COMMENTS
-- ===================================
COMMENT ON TABLE voters IS 'Stores voter registration information with hashed biometric data';
COMMENT ON TABLE voting_records IS 'Tracks which voters have voted in which elections';
COMMENT ON TABLE iot_terminals IS 'Registry of all IoT voting terminals';
COMMENT ON TABLE fraud_alerts IS 'ML-detected anomalies and fraud attempts';
COMMENT ON COLUMN voters.biometric_hash IS 'SHA-256 hash of fingerprint template, never stores raw biometric data';
COMMENT ON COLUMN voting_records.blockchain_tx_id IS 'Reference to blockchain transaction for auditability';
