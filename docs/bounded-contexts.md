# Bounded Context Rollout

This repository now supports bounded contexts at the database access layer without requiring table-copy migration.

## Contexts

- `voter_service`: `voters`, `students`
- `election_service`: `elections`, `candidates`, `poll_approvals`
- `vote_service`: `voting_records`, `vote_nonces`, `outbox_events`, `dead_letter_events`

## How it works

1. Base tables remain in `public` (no data move, zero downtime).
2. Bootstrap creates context schemas and `CREATE OR REPLACE VIEW ... AS SELECT * FROM public.<table>`.
3. Sequelize models are configured to use schema-qualified tables, so route/service reads and writes are context-scoped.
4. In bounded-context mode (`USE_BOUNDED_CONTEXTS=true`), global `sequelize.sync()` is skipped to avoid conflict with schema views.

## Environment flags

- `USE_BOUNDED_CONTEXTS=true` (default)
- `VOTER_CONTEXT_SCHEMA=voter_service`
- `ELECTION_CONTEXT_SCHEMA=election_service`
- `VOTE_CONTEXT_SCHEMA=vote_service`

## APIs

- `GET /api/v1/contexts/health` (admin/observer)
  - returns active schemas + outbox/dead-letter queue depth

## Notes

- This is a safe isolation layer and migration bridge.
- If you later want physical table split per context DB/schema, create tables in each context schema and replace views with real tables + dual-write cutover.
