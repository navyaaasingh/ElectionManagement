# Institutional RBAC and Booth API Contract

Base path: /api/v1

This contract extends existing endpoints with supervisor booth operations, eligibility policy workflows, and custody/audit flows.

## 1. Conventions

## 1.1 Headers

- Authorization: Bearer <jwt>
- X-CSRF-Token: required for write endpoints that currently enforce CSRF in backend

## 1.2 Success envelope

```json
{
  "success": true,
  "message": "operation completed",
  "data": {}
}
```

## 1.3 Error envelope

```json
{
  "success": false,
  "code": "ELECTION_STATE_INVALID",
  "error": "Election must be ACTIVE_POLLING",
  "details": {}
}
```

## 2. Role Matrix

- VOTER: read own eligibility and voting status; cast via terminal workflow.
- SUPERVISOR: manage assigned booth sessions, run verification, issue ballot tokens.
- ADMIN: manage elections, eligibility, assignments, overrides, and audit exports.
- SUPER_ADMIN: all ADMIN operations plus policy governance.
- OBSERVER: read-only operations dashboard and scoped audit views.
- AUDITOR: read-only full audit/custody exports.

## 3. Endpoint Catalog

## 3.1 Election lifecycle and eligibility

### POST /elections/:electionId/lifecycle/transition

Role: ADMIN, SUPER_ADMIN

Request:

```json
{
  "targetState": "READY_FOR_POLLING",
  "reason": "All eligibility checks completed"
}
```

Validation:
- targetState in allowed state enum
- transition must be legal from current state

Response:

```json
{
  "success": true,
  "data": {
    "electionId": "uuid",
    "fromState": "ELIGIBILITY_FROZEN",
    "toState": "READY_FOR_POLLING",
    "transitionedBy": "uuid",
    "transitionedAt": "2026-04-16T08:15:30.000Z"
  }
}
```

### POST /eligibility/policies

Role: ADMIN, SUPER_ADMIN

Request:

```json
{
  "electionId": "uuid",
  "name": "UG 2026 policy",
  "rules": {
    "include": {
      "department": ["CSE", "ECE"],
      "program": ["BTECH"],
      "section": ["A", "B"],
      "academic_year": [1, 2, 3, 4]
    },
    "required_flags": {
      "isApproved": true,
      "aadhaarVerified": true,
      "biometricRegistered": true
    }
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "policyId": "uuid",
    "version": 1,
    "status": "DRAFT"
  }
}
```

### POST /eligibility/bulk-validate

Role: ADMIN, SUPER_ADMIN

Request:

```json
{
  "electionId": "uuid",
  "policyId": "uuid"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "eligibleCount": 4120,
    "ineligibleCount": 380,
    "reasonCounts": {
      "MISSING_SECTION": 62,
      "AADHAAR_NOT_VERIFIED": 87,
      "BIOMETRIC_NOT_REGISTERED": 231
    }
  }
}
```

## 3.2 Supervisor assignment and booth sessions

### POST /supervisor/assignments

Role: ADMIN, SUPER_ADMIN

Request:

```json
{
  "electionId": "uuid",
  "boothId": "uuid",
  "supervisorAdminId": "uuid",
  "startsAt": "2026-04-20T08:30:00.000Z",
  "endsAt": "2026-04-20T17:30:00.000Z"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "assignmentId": "uuid",
    "status": "ACTIVE"
  }
}
```

### POST /supervisor/sessions/start

Role: SUPERVISOR, ADMIN, SUPER_ADMIN

Request:

```json
{
  "electionId": "uuid",
  "boothId": "uuid",
  "terminalId": "uuid"
}
```

Validation:
- caller has active assignment for booth and election or admin override
- election state must be ACTIVE_POLLING
- no other ACTIVE session for booth

Response:

```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "status": "ACTIVE",
    "startedAt": "2026-04-20T09:00:00.000Z"
  }
}
```

### POST /supervisor/sessions/:sessionId/pause

Role: SUPERVISOR, ADMIN, SUPER_ADMIN

Request:

```json
{
  "reasonCode": "SECURITY_CHECK"
}
```

### POST /supervisor/sessions/:sessionId/resume

Role: SUPERVISOR, ADMIN, SUPER_ADMIN

Request:

```json
{
  "reasonCode": "ISSUE_RESOLVED"
}
```

### POST /supervisor/sessions/:sessionId/stop

Role: SUPERVISOR, ADMIN, SUPER_ADMIN

Request:

```json
{
  "reasonCode": "POLLING_ENDED"
}
```

## 3.3 Verification and ballot issuance

### POST /verification/biometric

Role: SUPERVISOR, ADMIN, SUPER_ADMIN

Request:

```json
{
  "sessionId": "uuid",
  "voterId": "uuid",
  "biometricTemplateHash": "sha256hex",
  "terminalNonce": "string"
}
```

Validation:
- voter status active and approved
- voter eligible for election
- voter has not already voted
- biometric hash match

Response (verified):

```json
{
  "success": true,
  "data": {
    "verificationStatus": "VERIFIED",
    "reasonCode": null,
    "attemptCount": 1
  }
}
```

Response (rejected):

```json
{
  "success": false,
  "code": "VOTER_INELIGIBLE",
  "error": "Voter is not eligible for this election",
  "details": {
    "reasonCode": "SECTION_NOT_ALLOWED"
  }
}
```

### POST /verification/manual-override

Role: SUPERVISOR, ADMIN, SUPER_ADMIN

Request:

```json
{
  "sessionId": "uuid",
  "voterId": "uuid",
  "reasonCode": "FINGERPRINT_SENSOR_FAILURE",
  "notes": "Multiple retries failed"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "overrideRequestId": "uuid",
    "status": "PENDING_APPROVAL"
  }
}
```

### POST /verification/manual-override/:overrideId/approve

Role: ADMIN, SUPER_ADMIN

Request:

```json
{
  "decision": "APPROVE",
  "notes": "Verified government ID and student card"
}
```

### POST /ballots/issue

Role: SUPERVISOR, ADMIN, SUPER_ADMIN

Request:

```json
{
  "sessionId": "uuid",
  "voterId": "uuid",
  "ttlSeconds": 120
}
```

Response:

```json
{
  "success": true,
  "data": {
    "tokenId": "uuid",
    "token": "opaque-one-time-token",
    "expiresAt": "2026-04-20T09:15:10.000Z"
  }
}
```

## 3.4 Vote cast and status

### POST /votes/cast

Role: internal terminal flow (validated token)

Request:

```json
{
  "token": "opaque-one-time-token",
  "candidateId": "uuid",
  "terminalId": "uuid"
}
```

Validation:
- token exists, belongs to session, unexpired, unconsumed
- election in ACTIVE_POLLING
- candidate belongs to election and active
- duplicate vote check via unique voter-election key

Response:

```json
{
  "success": true,
  "message": "Vote cast successfully",
  "data": {
    "receiptId": "uuid",
    "txId": "fabric-transaction-id",
    "castAt": "2026-04-20T09:14:03.000Z"
  }
}
```

### GET /votes/status/:voterId/:electionId

Role: VOTER(self), ADMIN, SUPER_ADMIN

Response:

```json
{
  "success": true,
  "data": {
    "hasVoted": true,
    "castAt": "2026-04-20T09:14:03.000Z",
    "receiptId": "uuid"
  }
}
```

## 3.5 Dashboard and operations

### GET /operations/turnout?electionId=<uuid>&groupBy=department

Role: ADMIN, SUPER_ADMIN, OBSERVER, SUPERVISOR(scoped)

Response:

```json
{
  "success": true,
  "data": {
    "groupBy": "department",
    "rows": [
      {"key": "CSE", "eligible": 1200, "voted": 840, "turnoutPct": 70.0},
      {"key": "ECE", "eligible": 1000, "voted": 610, "turnoutPct": 61.0}
    ]
  }
}
```

### GET /terminal/status

Role: ADMIN, SUPER_ADMIN, OBSERVER

Response:

```json
{
  "success": true,
  "data": {
    "terminals": [
      {
        "terminalId": "uuid",
        "boothId": "uuid",
        "status": "ONLINE",
        "queueLength": 3,
        "lastHeartbeat": "2026-04-20T09:14:20.000Z"
      }
    ]
  }
}
```

## 3.6 Audit and custody

### GET /audit

Role: ADMIN, SUPER_ADMIN, OBSERVER, AUDITOR

Query params:
- electionId
- actorRole
- eventType
- from
- to
- page
- limit

### GET /custody/events?electionId=<uuid>&boothId=<uuid>

Role: ADMIN, SUPER_ADMIN, AUDITOR

Response:

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "eventId": "uuid",
        "eventType": "DEVICE_HANDOVER",
        "actorAdminId": "uuid",
        "eventHash": "sha256hex",
        "prevEventHash": "sha256hex",
        "createdAt": "2026-04-20T08:45:01.000Z",
        "metadata": {"terminalId": "uuid", "boothId": "uuid"}
      }
    ]
  }
}
```

### GET /audit/export?electionId=<uuid>&format=csv

Role: ADMIN, SUPER_ADMIN, AUDITOR

Output:
- signed export package with checksum metadata

## 4. Error Code Set

- AUTH_REQUIRED
- FORBIDDEN_ROLE
- FORBIDDEN_SCOPE
- ELECTION_STATE_INVALID
- BOOTH_ASSIGNMENT_INVALID
- SESSION_NOT_ACTIVE
- VOTER_NOT_FOUND
- VOTER_INELIGIBLE
- BIOMETRIC_MISMATCH
- OVERRIDE_APPROVAL_REQUIRED
- BALLOT_TOKEN_INVALID
- BALLOT_TOKEN_EXPIRED
- DUPLICATE_VOTE_ATTEMPT
- RATE_LIMITED
- CONFLICT_WRITE

## 5. Minimum Test Matrix

1. every write endpoint authorization denial by wrong role
2. supervisor scope denial outside assigned booth
3. ballot token replay rejection
4. duplicate vote race condition rejection
5. lifecycle guard rejection for wrong state
6. override approval flow with full audit chain
