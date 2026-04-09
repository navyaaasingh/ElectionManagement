-- Add explicit schema changes for logic polish release.
-- Safe to run repeatedly.

ALTER TABLE IF EXISTS elections
    ADD COLUMN IF NOT EXISTS eligibility_rules JSONB,
    ADD COLUMN IF NOT EXISTS runoff_config JSONB;

ALTER TABLE IF EXISTS voters
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS party_affiliation VARCHAR(100),
    ADD COLUMN IF NOT EXISTS state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS location_meta JSONB;

ALTER TABLE IF EXISTS candidates
    ADD COLUMN IF NOT EXISTS runoff_status VARCHAR(20) DEFAULT 'active';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'candidates'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'candidates_runoff_status_check'
    ) THEN
        ALTER TABLE candidates
            ADD CONSTRAINT candidates_runoff_status_check
            CHECK (runoff_status IN ('active', 'eliminated', 'winner'));
    END IF;
END $$;

ALTER TABLE IF EXISTS voting_records
    ADD COLUMN IF NOT EXISTS candidate_id UUID,
    ADD COLUMN IF NOT EXISTS ranking_payload JSONB;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'voting_records'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'candidates'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'voting_records_candidate_fk'
          AND table_name = 'voting_records'
    ) THEN
        ALTER TABLE voting_records
            ADD CONSTRAINT voting_records_candidate_fk
            FOREIGN KEY (candidate_id) REFERENCES candidates(candidate_id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'voting_records'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_voting_records_candidate_id
            ON voting_records(candidate_id);

        CREATE INDEX IF NOT EXISTS idx_voting_records_election_time
            ON voting_records(election_id, vote_timestamp);
    END IF;
END $$;
