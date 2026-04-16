# Institutional Election Platform Specification

## 1. Purpose

Define a production-grade election operating model for:
- strict role-based access control (RBAC)
- supervised in-person polling booth mode
- biometric verification with fallback controls
- one-person-one-vote enforcement across booths/devices
- auditable, chain-of-custody election operations

This specification converts product goals into functional requirements, user flows, backend rules, and edge-case handling.

---

## 2. Scope

### In scope
- Voter, Supervisor, Admin, Observer, Auditor role boundaries
- Election lifecycle and control points
- Eligibility filtering by institution attributes
- Polling session controls and supervised operation
- Vote issuance and duplicate-vote prevention
- Audit and chain-of-custody event model
- Role-specific dashboards and metrics

### Out of scope
- UI visual design details
- biometric hardware vendor SDK implementation details
- legal policy drafting for jurisdiction-specific law

---

## 3. Role Model

## 3.1 Roles

1. Voter
2. Supervisor (new)
3. Admin
4. Observer
5. Auditor

## 3.2 Role intent

- Voter: participate in eligible elections only.
- Supervisor: run assigned active polling sessions, verify voters, handle exceptions inside controlled policy.
- Admin: full election management and assignment authority.
- Observer: read-only election transparency dashboards.
- Auditor: read-only, full audit/custody evidence export and verification.

## 3.3 Assignment constraints

- Supervisor assignment is per election and optionally per booth.
- Supervisor cannot configure election policy, candidates, or voter data globally.
- Admin cannot cast votes through supervisor tooling.
- Observer and Auditor cannot perform operational state changes.

---

## 4. RBAC Permission Matrix

| Capability | Voter | Supervisor | Admin | Observer | Auditor |
|---|---|---|---|---|---|
| View eligible elections | Yes | Assigned election | All | All published/active | All |
| View election setup config | No | Assigned (read only) | Yes | Read only | Read only |
| Create/update election | No | No | Yes | No | No |
| Manage candidates | No | No | Yes | No | No |
| Manage voter roster | No | Limited lookup | Yes | No | Read only |
| Start/stop polling session | No | Assigned only | Yes | No | No |
| Pause/resume booth | No | Assigned only | Yes | No | No |
| Perform biometric verify | No | Yes | Optional emergency | No | No |
| Issue ballot token | No | Yes | Optional emergency | No | No |
| Cast vote | Yes (self only) | No | No | No | No |
| View turnout dashboard | Eligible elections only | Assigned election detailed | All detailed | Aggregated only | All detailed |
| View audit logs | Own actions only | Assigned election scope | All | Limited read | Full read |
| Override decision | No | Controlled override types | Yes | No | No |
| Export compliance report | No | No | Yes | No | Yes |

---

## 5. Data Visibility Rules

## 5.1 Voter visibility

- Show only elections where voter is eligible OR has a vote record (history rule).
- Show only public metadata for non-eligible elections (optional discoverability mode).
- Hide all admin and booth controls.

## 5.2 Supervisor visibility

- Show assigned election(s), assigned booth(s), and operational status only.
- Show voter lookup result fields needed for check-in, not full voter profile.
- Show live turnout for assigned scope only.

## 5.3 Observer visibility

- Show aggregate turnout, timeline events, and incidents without personally identifying information.

## 5.4 Auditor visibility

- Full read-only audit, custody, and reconciliation datasets.
- Access includes exports and tamper-verification proofs.

---

## 6. Election Lifecycle State Machine

Proposed states:
1. DRAFT
2. REGISTRATION_OPEN
3. REGISTRATION_CLOSED
4. ELIGIBILITY_FROZEN
5. READY_FOR_POLLING
6. ACTIVE_POLLING
7. PAUSED
8. POLLING_CLOSED
9. TALLYING
10. AUDITING
11. CERTIFIED
12. ARCHIVED

Transition rules:
- Only Admin can transition DRAFT through READY_FOR_POLLING.
- Supervisor can transition ACTIVE_POLLING <-> PAUSED only for assigned election.
- ACTIVE_POLLING requires at least one assigned active booth session.
- POLLING_CLOSED can be triggered by Admin or auto at end time.
- No backward transitions after CERTIFIED.

Required state checks at vote time:
- election state must be ACTIVE_POLLING
- polling window must be open
- booth session must be ACTIVE

---

## 7. Functional Requirements

## 7.1 Access Control

- FR-001: System shall enforce RBAC for every API endpoint and UI route.
- FR-002: System shall enforce row-level filters by role and assignment.
- FR-003: System shall deny access by default when role-policy mapping is absent.

## 7.2 Election and Assignment Management

- FR-004: Admin shall assign one or more supervisors to an election.
- FR-005: Admin shall assign booths/devices to supervisors with effective start/end.
- FR-006: System shall log every assignment, reassignment, and revocation.

## 7.3 Eligibility Configuration

- FR-007: Election policy shall support eligibility filters for section, class, department, year, course/program.
- FR-008: Admin shall preview eligible voter count before publishing election.
- FR-009: System shall provide pre-election batch validation and exception report.
- FR-010: On polling day, ineligible voters shall be blocked before ballot issuance.

## 7.4 Polling Session Control

- FR-011: Supervisor shall start polling session only if assigned and election is READY_FOR_POLLING or ACTIVE_POLLING.
- FR-012: Supervisor shall pause/resume session with mandatory reason.
- FR-013: Session stop shall be supervisor/admin controlled and fully audited.
- FR-014: Session shall auto-close at election end time unless emergency extension approved by Admin.

## 7.5 Biometric and Verification

- FR-015: Fingerprint verification shall be required before ballot issuance in supervised booth mode.
- FR-016: System shall enforce max failed biometric attempts and cooldown lock.
- FR-017: If biometric fails, system shall support manual verification workflow with reason code and dual authorization policy.
- FR-018: Manual verification shall require Supervisor action and optional Admin second approval for high-risk scenarios.

## 7.6 Vote Issuance and Casting

- FR-019: After successful verification, system shall issue one-time ballot token.
- FR-020: Ballot token shall expire quickly (for example 120 seconds) and be single-use.
- FR-021: System shall prevent duplicate voting by voter-election unique constraint.
- FR-022: System shall reject replay attempts across devices using nonce/token checks.
- FR-023: System shall reject vote if session pauses or closes before cast finalization.

## 7.7 Duplicate Prevention Across Booths

- FR-024: Duplicate prevention shall use transactional lock on voter record plus unique voter-election vote record.
- FR-025: Simultaneous check-ins at multiple booths shall allow only first successful transaction.
- FR-026: All rejected duplicates shall be audit logged with booth/device metadata.

## 7.8 Dashboards and Monitoring

- FR-027: Voter dashboard shall show eligible elections, participation status, and public progress.
- FR-028: Supervisor dashboard shall show queue, verification outcomes, and turnout for assigned scope.
- FR-029: Admin dashboard shall show system-wide turnout, incidents, and booth health.
- FR-030: Observer dashboard shall show aggregate, privacy-preserving transparency metrics.

## 7.9 Audit and Chain of Custody

- FR-031: System shall audit login, verification attempt, ballot issuance, vote cast, rejection, override, and session state transitions.
- FR-032: System shall capture custody events for election activation, device assignment, handover, and seal status checks.
- FR-033: Every critical event shall include actor, role, device, booth, election, timestamp, and reason.
- FR-034: Audit export shall support immutable evidence package generation for auditors.

## 7.10 Exception Handling

- FR-035: System shall classify exceptions (biometric mismatch, ineligible voter, device failure, duplicate detected, network outage).
- FR-036: Each exception shall produce operator guidance and mandatory resolution path.
- FR-037: Overrides shall be policy-bound and never bypass duplicate-vote rules.

---

## 8. User Flows

## 8.1 Admin pre-election setup

1. Create election.
2. Configure eligibility rules.
3. Validate eligible voter pool.
4. Assign supervisors and booths/devices.
5. Move election to READY_FOR_POLLING.

## 8.2 Supervisor polling startup

1. Supervisor signs in.
2. Supervisor opens assigned election booth mode.
3. System verifies assignment and time window.
4. Supervisor starts session.
5. Session state becomes ACTIVE and custody event is logged.

## 8.3 Voter in-person vote flow

1. Voter identifies at booth.
2. Fingerprint verification.
3. Eligibility check against election policy.
4. Duplicate-vote pre-check.
5. Issue short-lived single-use ballot token.
6. Voter selects candidate and submits vote.
7. Commit vote with transactional duplicate prevention.
8. Mark voter as voted and return success receipt.
9. Update turnout counters in real time.

## 8.4 Ineligible voter flow

1. Verification passes identity, fails eligibility filter.
2. Ballot is not issued.
3. Rejection reason displayed.
4. Event logged with policy rule failure detail.

## 8.5 Biometric mismatch/device failure fallback

1. Biometric retry until threshold reached.
2. If threshold exceeded, open supervised exception flow.
3. Supervisor starts manual verification (ID roster + secondary factor).
4. System requires reason and optional dual authorization.
5. If approved, issue restricted manual ballot token.
6. Full override chain logged.

## 8.6 Duplicate attempt flow

1. Voter already marked voted or vote record exists.
2. Ballot issuance blocked immediately.
3. Duplicate attempt event logged with device and booth context.
4. Supervisor dashboard incident counter increases.

---

## 9. Backend Logic Rules

## 9.1 Authorization rule

Authorize on three dimensions:
- role permission
- assignment scope
- resource state

Pseudo-rule:
- allow if role_permission(action, resource)
- and assignment_scope(user, resource)
- and state_guard(resource, action)
- else deny and audit

## 9.2 Eligibility rule evaluation

Evaluate in order:
1. election active and polling window open
2. voter identity status active
3. voter not already voted
4. section/class/department/year/course policy match
5. any custom rule predicates

Return:
- eligible: true/false
- reason_code
- failed_rule_id

## 9.3 Vote transaction rule

Inside one transaction:
1. lock voter row
2. confirm not voted
3. validate token/nonce single-use
4. insert vote record with unique voter-election key
5. update voter has_voted
6. append outbox/audit events
7. commit

If any failure: rollback and return deterministic rejection code.

## 9.4 Time window enforcement

- Server authoritative time only.
- Reject voting attempts before start or after end.
- Grace period controlled via policy and audited when used.

## 9.5 Supervisor session guard

- vote issuance requires booth_session.status == ACTIVE
- booth_session must belong to election and supervisor
- paused session blocks token issuance and vote finalization

---

## 10. Audit Event Catalog

Required events:
- AUTH_LOGIN_SUCCESS
- AUTH_LOGIN_FAILED
- ELECTION_STATE_CHANGED
- SUPERVISOR_ASSIGNED
- DEVICE_ASSIGNED
- SESSION_STARTED
- SESSION_PAUSED
- SESSION_RESUMED
- SESSION_STOPPED
- BIOMETRIC_VERIFY_SUCCESS
- BIOMETRIC_VERIFY_FAILED
- ELIGIBILITY_PASS
- ELIGIBILITY_REJECTED
- BALLOT_TOKEN_ISSUED
- BALLOT_TOKEN_EXPIRED
- VOTE_CAST_SUCCESS
- VOTE_CAST_REJECTED
- DUPLICATE_VOTE_BLOCKED
- MANUAL_OVERRIDE_REQUESTED
- MANUAL_OVERRIDE_APPROVED
- MANUAL_OVERRIDE_DENIED
- DEVICE_FAILURE_REPORTED
- CHAIN_OF_CUSTODY_HANDOVER

Minimum event fields:
- event_id
- event_type
- timestamp
- actor_id
- actor_role
- election_id
- booth_id
- device_id
- voter_id (nullable where not applicable)
- reason_code
- correlation_id
- metadata

---

## 11. Chain-of-Custody Requirements

Custody log must capture:
- election activation authorization
- device assignment to booth and supervisor
- supervisor handover start/end
- booth open/close seal verification events
- incident declaration and closure
- post-close device return and evidence pack hash

Optional integrity enhancement:
- hash-chain custody records and anchor periodic root hash to blockchain.

---

## 12. Edge Cases and Exceptional Scenarios

1. Two booths verify same voter simultaneously.
2. Voter verifies, then booth loses connectivity before vote cast.
3. Election end time reached while voter is on ballot screen.
4. Supervisor account session expires during active queue.
5. Device clock drift differs from server time.
6. Fingerprint sensor returns low-quality template repeatedly.
7. Voter record has missing eligibility attributes.
8. Supervisor assigned to wrong election by mistake.
9. Emergency pause requested during suspected coercion incident.
10. Duplicate voter records with same identity attributes.
11. Token replay from captured request payload.
12. Voter attempts to switch booths after verification.
13. Manual override requested without valid reason code.
14. Audit store unavailable during critical action.
15. Device replacement during active polling.
16. Candidate withdrawn while polling is active.
17. Partial write after vote cast and before receipt display.
18. High-volume rejection flood indicates abuse attempt.
19. Observer requests personally identifiable verification logs.
20. Post-close recount request conflicts with certified state.

---

## 13. Acceptance Criteria (Implementation Ready)

- AC-001: No voter can access admin or supervisor features.
- AC-002: Only assigned supervisor can run assigned booth session.
- AC-003: Ineligible voter cannot receive ballot token.
- AC-004: Duplicate vote attempts are blocked across all booths/devices.
- AC-005: Every critical action appears in audit log within acceptable delay.
- AC-006: Custody report can be exported for any election and validates integrity.
- AC-007: Polling time window is enforced by server-side rule, not client clock.
- AC-008: Manual override requires policy-compliant authorization and leaves complete trace.

---

## 14. Suggested Implementation Phases

### Phase 1 (Foundational RBAC and lifecycle)
- Add Supervisor role and assignment model.
- Implement election state machine with guarded transitions.
- Add row-level visibility filters for voter/supervisor/observer.

### Phase 2 (Polling booth operations)
- Implement booth session start/pause/resume/stop.
- Add ballot token issuance workflow.
- Add eligibility attributes (section, class, year) and policy UI/API.

### Phase 3 (Exception and integrity)
- Add biometric fallback and manual override policy.
- Expand audit event catalog and custody logs.
- Add reconciliation dashboards and compliance exports.

### Phase 4 (Hardening)
- Add abuse/risk analytics for anomaly clusters.
- Add cryptographic integrity checks for audit and custody trails.
- Conduct operational drills and incident playbooks.

---

## 15. Notes for Current Codebase Alignment

This spec is designed to align with existing architecture artifacts and services, while closing current gaps around:
- supervisor booth mode
- section/class/year eligibility policy
- lifecycle transition rigor
- custody-grade auditability

Related architecture references:
- docs/architecture/LIFECYCLE_AND_ROLES.md
- docs/architecture/SYSTEM_ARCHITECTURE.md
- docs/architecture/API_CONTRACTS.md
