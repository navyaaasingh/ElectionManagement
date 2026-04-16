# Election Platform Implementation Execution Blueprint

## 1. Objective

Deliver a production-oriented institutional election system that is directly buildable by engineering, QA, and operations teams.

This blueprint provides:
- functional requirements and constraints
- concrete module boundaries
- frontend page/route architecture
- backend API contracts and workflow rules
- database entities and relationships
- RBAC and security controls
- execution phases, milestones, and acceptance gates

---

## 2. Product Scope and Roles

## 2.1 User roles

1. VOTER
2. SUPERVISOR
3. ADMIN
4. SUPER_ADMIN
5. OBSERVER
6. AUDITOR

## 2.2 High-level role outcomes

- VOTER: sees eligible elections and own participation state only.
- SUPERVISOR: runs assigned polling booth sessions for active elections.
- ADMIN: configures elections, candidates, eligibility, rosters, assignments.
- SUPER_ADMIN: full governance and policy control.
- OBSERVER: transparency dashboards and non-sensitive insights.
- AUDITOR: full read-only audit and custody evidence exports.

---

## 3. Functional Requirement Set

## 3.1 Access and RBAC

- FR-001: Deny-by-default endpoint authorization.
- FR-002: UI route guards must match backend authorization policies.
- FR-003: Data access must be filtered by role and assignment scope.
- FR-004: Supervisor actions must be limited to assigned election and booth scope.

## 3.2 Election lifecycle

- FR-005: Election state machine must enforce legal transitions.
- FR-006: Voting actions allowed only in ACTIVE_POLLING.
- FR-007: Session start/stop/pause/resume must be auditable.

## 3.3 Eligibility

- FR-008: Eligibility policies must support department, course/program, section, class_name, and academic_year.
- FR-009: Pre-election bulk eligibility validation required.
- FR-010: Ineligible voters must be blocked before ballot issuance.

## 3.4 Polling booth mode

- FR-011: Supervisor can start polling only if assigned and election is in valid state.
- FR-012: Booth session must bind election, booth, supervisor, and active device.
- FR-013: Emergency pause/resume requires reason code.

## 3.5 Biometric verification and fallback

- FR-014: Fingerprint verification required before ballot token issuance.
- FR-015: Failed attempts threshold and cooldown lock required.
- FR-016: Manual verification fallback requires explicit override flow with audit chain.

## 3.6 One-person-one-vote integrity

- FR-017: Duplicate vote prevention must operate across all booths and devices.
- FR-018: Nonce/token replay protection mandatory.
- FR-019: Vote transaction must be atomic and rollback-safe.

## 3.7 Observability and audit

- FR-020: Critical actions must generate immutable-like audit events.
- FR-021: Chain-of-custody logs required for activation, handover, assignment, and closeout.
- FR-022: Exportable evidence packages for audits and disputes required.

---

## 4. Module Breakdown and Responsibilities

## 4.1 Frontend modules

1. Auth and Session Module
- login, token refresh, logout, role claim hydration

2. Voter Experience Module
- eligible election listing
- self vote status
- participation receipt/verification

3. Supervisor Booth Module
- booth session controls
- queue and identity verification
- fallback/override workflow
- incident actions

4. Admin Operations Module
- election setup and lifecycle
- candidate and voter management
- eligibility policy management
- supervisor/device assignment

5. Observer and Auditor Module
- turnout and integrity dashboards
- event and custody timeline
- export/reporting

6. Shared UI and Security Utilities
- route guards
- permission hooks
- secured API client

## 4.2 Backend modules

1. Identity and Access Service
- JWT issuance and verification
- role and permission evaluation

2. Election Service
- lifecycle state transitions
- election metadata and schedule enforcement

3. Eligibility Service
- policy compile/evaluate
- pre-election batch validation
- runtime check at booth

4. Booth Session Service
- supervisor assignment checks
- session start/pause/resume/stop
- device-to-booth control

5. Biometric Service
- hash verification and failure controls
- fallback/manual verification orchestration

6. Vote Service
- ballot token issuance and consume
- duplicate prevention
- vote record and outbox events

7. Audit and Custody Service
- event log writes
- custody chain updates
- export and verification endpoints

8. Reporting Service
- role-scoped dashboards
- turnout aggregates by dimension

## 4.3 Data and infra modules

1. PostgreSQL transactional store
2. MongoDB operational logs and long-tail audit access
3. Redis rate limiting, locks, and short-lived token cache
4. MQTT channel for terminal/booth interactions
5. Kafka outbox/event streaming for analytics and ML

---

## 5. Frontend Architecture and Page Structure

## 5.1 App topology

Current monorepo already contains:
- unified app shell: frontend
- role-specific surfaces: admin-portal, observer-dashboard, voter-ui

Recommended execution path:
- maintain existing apps
- introduce shared route and permission contract in frontend/src/lib

## 5.2 Required route map

### Public
- /login
- /signup
- /about
- /privacy

### Voter
- /app/voter/elections
- /app/voter/elections/:electionId
- /app/voter/history
- /app/voter/verify/:receiptId

### Supervisor
- /app/supervisor/dashboard
- /app/supervisor/elections/:electionId/booths/:boothId/session
- /app/supervisor/queue
- /app/supervisor/incidents
- /app/supervisor/overrides

### Admin and Super Admin
- /app/admin/elections
- /app/admin/elections/:id/lifecycle
- /app/admin/elections/:id/eligibility
- /app/admin/elections/:id/assignments
- /app/admin/voters
- /app/admin/candidates
- /app/admin/devices
- /app/admin/audit

### Observer
- /app/observer/dashboard
- /app/observer/turnout
- /app/observer/incidents

### Auditor
- /app/auditor/events
- /app/auditor/custody
- /app/auditor/exports

## 5.3 Frontend state slices

- authState: token, role, permissions, scoped assignments
- electionState: active election metadata and status
- boothState: active booth session and queue
- verificationState: biometric attempts and fallback state
- dashboardState: turnout and alert streams

---

## 6. Backend Architecture and API Design

## 6.1 API versioning

- base path: /api/v1
- mandatory structured response envelope
- deterministic error codes for policy violations

## 6.2 Authorization design

Enforce middleware chain:
1. authenticate JWT
2. authorize role/permission
3. enforce scope guard (election, booth, district)
4. enforce state guard (election/session state)

## 6.3 Core API endpoint catalog

### Identity and auth

1. POST /api/v1/auth/login-email
- role: voter
- result: voter token

2. POST /api/v1/auth/admin/login
- role: admin/super_admin/observer/supervisor/auditor
- result: scoped role token

3. GET /api/v1/auth/verify
- role: all authenticated
- result: token claims and active permissions

### Election management

4. POST /api/v1/elections
- role: admin
- create election

5. PUT /api/v1/elections/:id
- role: admin
- update election configuration

6. PUT /api/v1/elections/:id/status
- role: admin
- lifecycle transition with guard

7. GET /api/v1/elections/:id/eligibility/:voterId
- role: admin, observer
- evaluate eligibility with reason output

### Eligibility operations

8. POST /api/v1/eligibility/policies
- role: admin
- create policy ruleset

9. PUT /api/v1/eligibility/policies/:policyId
- role: admin
- update ruleset and version

10. POST /api/v1/eligibility/bulk-validate
- role: admin
- batch validation and report

### Supervisor and booth session

11. POST /api/v1/supervisor/sessions/start
- role: supervisor, admin
- start booth session

12. POST /api/v1/supervisor/sessions/:sessionId/pause
- role: supervisor, admin
- pause session with reason

13. POST /api/v1/supervisor/sessions/:sessionId/resume
- role: supervisor, admin
- resume paused session

14. POST /api/v1/supervisor/sessions/:sessionId/stop
- role: supervisor, admin
- stop session and close queue

15. GET /api/v1/supervisor/sessions/:sessionId/queue
- role: supervisor, admin
- queue and verification outcomes

### Verification and ballot issuance

16. POST /api/v1/verification/biometric
- role: supervisor, admin
- input: voter identity context + biometric hash
- output: verification status and eligibility decision

17. POST /api/v1/verification/manual-override
- role: supervisor, admin
- creates override request

18. POST /api/v1/verification/manual-override/:id/approve
- role: admin (or dual policy approver)
- approve/reject override

19. POST /api/v1/ballots/issue
- role: supervisor, admin
- create one-time ballot token

20. POST /api/v1/ballots/consume
- role: voter token context
- consume token and cast vote transactionally

### Voting and results

21. POST /api/v1/votes/cast
- role: system/internal terminal flow
- enforce duplicate and state guards

22. GET /api/v1/votes/status/:voterId/:electionId
- role: voter self, admin scoped

23. GET /api/v1/results/:electionId
- role: public/observer/admin policy controlled

24. GET /api/v1/results/:electionId/district/:districtId
- role: observer/admin

### Dashboard and monitoring

25. GET /api/v1/operations/dashboard
- role: admin, observer

26. GET /api/v1/operations/turnout
- role: admin, observer, supervisor (scoped)

27. GET /api/v1/terminal/status
- role: admin, observer

### Audit and custody

28. GET /api/v1/audit
- role: admin, observer, auditor (scope policy)

29. GET /api/v1/audit/export
- role: admin, auditor

30. GET /api/v1/custody/events
- role: admin, auditor

31. POST /api/v1/custody/events
- role: system/admin/supervisor (action based)

---

## 7. Database Schema and Entity Relationships

## 7.1 Existing entities reused

- elections
- candidates
- voters
- students
- admin_users
- iot_terminals
- voting_records
- audit_logs

## 7.2 New entities required

1. polling_booths
2. supervisor_assignments
3. booth_device_assignments
4. booth_sessions
5. ballot_tokens
6. manual_override_requests
7. vote_attempts
8. custody_events

## 7.3 Relationship model

- elections 1..N polling_booths
- admin_users (SUPERVISOR) 1..N supervisor_assignments
- polling_booths 1..N booth_sessions
- booth_sessions 1..N ballot_tokens
- booth_sessions 1..N vote_attempts
- voters 1..N vote_attempts
- elections 1..N custody_events
- iot_terminals N..N polling_booths through booth_device_assignments

## 7.4 Eligibility attributes

Add to students and voters:
- section
- class_name
- academic_year

These fields are required for rule matching and reporting segmentation.

---

## 8. Authentication and Role Authorization Rules

## 8.1 JWT claims

Required claims:
- sub
- role
- adminRole
- permissions
- districtId
- electionScopes
- boothScopes
- iat
- exp

## 8.2 Permission keys

- election:create
- election:update
- election:transition
- eligibility:manage
- supervisor:session:start
- supervisor:session:pause
- supervisor:session:resume
- supervisor:session:stop
- ballot:issue
- vote:cast
- audit:read
- audit:export
- custody:read

## 8.3 Enforcement points

- backend middleware on all protected endpoints
- service-layer policy checks before writes
- database constraints to backstop policy failures

---

## 9. Biometric Verification Workflow

## 9.1 Primary path

1. capture biometric from terminal
2. hash and validate format
3. lookup active voter profile
4. check election eligibility
5. check duplicate-vote status
6. issue one-time ballot token

## 9.2 Fallback path

1. increment biometric failure count
2. lock after threshold
3. allow supervisor to submit manual verification request
4. require policy-based approver action
5. if approved, issue restricted token and log override chain

---

## 10. Election Lifecycle Logic

## 10.1 Allowed states

DRAFT -> REGISTRATION_OPEN -> REGISTRATION_CLOSED -> ELIGIBILITY_FROZEN -> READY_FOR_POLLING -> ACTIVE_POLLING -> PAUSED -> POLLING_CLOSED -> TALLYING -> AUDITING -> CERTIFIED -> ARCHIVED

## 10.2 Guard rules

- state transitions require role + transition policy
- ACTIVE_POLLING requires at least one active booth session
- vote cast requires election ACTIVE_POLLING and booth session ACTIVE
- transition operations always produce audit and custody events

---

## 11. Eligibility Rule Engine

## 11.1 Rule schema

Each rule set supports:
- include.department: string[]
- include.program: string[]
- include.course: string[]
- include.section: string[]
- include.class_name: string[]
- include.academic_year: integer[]
- exclude lists for same fields
- required flags: is_approved, aadhaar_verified, biometric_registered

## 11.2 Evaluation output

- eligible: boolean
- reason_code: enum
- failed_rules: string[]
- evaluated_at

## 11.3 Pre-election validation

Batch API returns:
- eligible count
- ineligible count by reason
- unresolved profile-data errors

---

## 12. Vote Integrity and Duplicate Prevention

## 12.1 Transactional protocol

Single DB transaction:
1. lock voter row
2. verify not voted in election
3. verify ballot token active and unconsumed
4. insert voting record (unique voter_id + election_id)
5. mark voter has_voted true
6. mark ballot token consumed
7. insert audit and outbox events
8. commit

## 12.2 Multi-device prevention

- unique voter-election record in database
- optional distributed lock key: vote:{electionId}:{voterId}
- nonce replay table for terminal requests

---

## 13. Validation Rules

## 13.1 Input validation

- UUID format checks for all IDs
- strict enum checks for statuses and reason codes
- timestamp normalization to UTC
- token TTL and one-time consumption checks

## 13.2 Business validation

- voter must be ACTIVE and not already voted
- election must be in allowed state and inside time window
- supervisor must be assigned and session-active
- candidate must belong to election and be active

---

## 14. Security Requirements

1. Mandatory JWT auth for non-public endpoints
2. CSRF protection on mutation endpoints
3. Rate limiting for auth, biometric verify, and vote cast
4. Least-privilege service account access
5. Full audit trail for all critical operations
6. Hash-only biometric storage and no raw template persistence
7. Secret rotation policy for JWT and service credentials
8. TLS for all external traffic and mTLS for sensitive internal channels where available
9. Data minimization in observer and auditor views
10. Incident alerting for abuse patterns and high-risk overrides

---

## 15. Recommended Tech Stack and Folder Structure

## 15.1 Stack

- Frontend: React + Vite + role-aware route guards
- Backend: Node.js + Express + Sequelize
- DB: PostgreSQL (transactional), MongoDB (document audit)
- Cache and lock: Redis
- Eventing: Kafka
- Device messaging: MQTT
- Optional: OpenTelemetry for traces and metrics

## 15.2 Backend folder expansion

Suggested additions under backend/src:

- modules/rbac/
  - permissionMap.js
  - policyEngine.js
- modules/booth/
  - booth.controller.js
  - booth.service.js
  - booth.repo.js
- modules/supervisor/
  - session.controller.js
  - session.service.js
- modules/eligibility/
  - policy.controller.js
  - policy.service.js
- modules/custody/
  - custody.controller.js
  - custody.service.js
- validations/
  - election.validation.js
  - supervisor.validation.js
  - ballot.validation.js

## 15.3 Frontend folder expansion

Suggested additions under frontend/src:

- features/auth/
- features/voter/
- features/supervisor/
- features/admin/
- features/observer/
- features/auditor/
- features/audit/
- features/custody/
- lib/rbac/
- lib/api/
- lib/guards/

---

## 16. Development Execution Plan and Milestones

## Phase 1: RBAC and lifecycle hardening (2 weeks)

Deliverables:
- SUPERVISOR role and permission map
- guarded lifecycle transitions
- route-level and row-level scope enforcement

Exit criteria:
- access test matrix passes for all roles

## Phase 2: Booth and supervisor operations (2 weeks)

Deliverables:
- polling_booths, supervisor_assignments, booth_sessions
- start/pause/resume/stop APIs and UI
- device assignment flow

Exit criteria:
- supervisor can run assigned booth end-to-end in staging

## Phase 3: Eligibility and verification (2 weeks)

Deliverables:
- section/class/year eligibility fields and policy APIs
- bulk pre-election validator
- biometric failure fallback and override workflow

Exit criteria:
- ineligible voter blocked consistently with reason code

## Phase 4: Vote integrity and audit chain (2 weeks)

Deliverables:
- ballot token issuance/consume
- duplicate prevention hardening and replay checks
- custody event pipeline and export

Exit criteria:
- one-person-one-vote concurrency tests pass
- custody report generated for election run

## Phase 5: Dashboards and operational readiness (2 weeks)

Deliverables:
- role-based dashboards (voter, supervisor, admin, observer, auditor)
- incident views and exception handling runbooks
- performance and security test completion

Exit criteria:
- UAT signoff and go-live checklist complete

---

## 17. QA and Testing Checklist

1. Role authorization tests per endpoint
2. Eligibility rule engine unit and integration tests
3. Vote race-condition and duplicate prevention concurrency tests
4. Session state transition tests
5. Biometric mismatch and fallback workflow tests
6. Audit and custody completeness tests
7. Time-window edge tests (start/end boundary)
8. Device failover and reconnect tests

---

## 18. Implementation-Ready Backlog Seed

1. Add supervisor role claim and permission map
2. Add booth and session migrations
3. Add eligibility attributes to students/voters
4. Build supervisor session APIs
5. Build ballot token APIs
6. Build manual override APIs
7. Add custody event APIs and exporter
8. Add frontend supervisor pages and guards
9. Add admin assignment UI
10. Add observer and auditor scoped dashboards

---

## 19. Deliverable Governance

Every story must include:
- endpoint contract changes
- DB migration changes (if any)
- audit event impacts
- security impacts
- test coverage updates
- rollback plan

This document is the execution baseline for engineering, QA, and operations.