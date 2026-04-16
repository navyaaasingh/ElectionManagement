# API Contract Specification

## Overview

This document defines all API contracts for the Election Management System. All endpoints follow RESTful conventions and return consistent response formats.

For institutional election supervisor and booth workflows (RBAC scopes, eligibility policy operations, ballot token APIs, and custody/audit extensions), refer to:

- `docs/api/INSTITUTIONAL_RBAC_BOOTH_API.md`

---

## Base URL

**Development:** `http://localhost:3000/api/v1`  
**Staging:** `https://staging-api.election-system.com/api/v1`  
**Production:** `https://api.election-system.com/api/v1`

---

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2024-02-09T01:30:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "timestamp": "2024-02-09T01:30:00Z"
}
```

---

## Authentication Endpoints

### 1. Register Voter
**POST** `/auth/register`

**Request:**
```json
{
  "aadharNumber": "123456789012",
  "biometricTemplate": "base64_encoded_fingerprint",
  "districtId": "uuid",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-15",
  "email": "john@example.com",
  "phoneNumber": "+911234567890"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "voterId": "uuid",
    "status": "ACTIVE",
    "registrationDate": "2024-02-09T01:30:00Z"
  },
  "message": "Voter registered successfully"
}
```

**Errors:**
- 400: Invalid Aadhar or already registered
- 422: Age < 18
- 500: Server error

---

### 2. Biometric Authentication
**POST** `/auth/biometric`

**Request:**
```json
{
  "biometricTemplate": "base64_encoded_fingerprint",
  "terminalId": "TERM-001"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "expiresIn": 86400,
    "voter": {
      "voterId": "uuid",
      "firstName": "John",
      "districtId": "uuid",
      "hasVoted": false
    }
  }
}
```

**Errors:**
- 401: Biometric not recognized
- 403: Voter blocked
- 500: Server error

---

### 3. Admin Login
**POST** `/auth/admin/login`

**Request:**
```json
{
  "username": "admin",
  "password": "secure_password"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "role": "ADMIN",
    "permissions": ["CREATE_ELECTION", "MANAGE_CANDIDATES"]
  }
}
```

---

## Voting Endpoints

### 4. Cast Vote
**POST** `/votes/cast`  
**Auth:** Required (JWT)

**Request:**
```json
{
  "voterId": "uuid",
  "electionId": "uuid",
  "candidateId": "uuid",
  "districtId": "uuid",
  "biometricHash": "sha256_hash",
  "terminalId": "TERM-001"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "voteId": "uuid",
    "blockchainTxId": "0xabc123...",
    "blockNumber": 12345,
    "receipt": {
      "voteId": "uuid",
      "commitment": "zkp_commitment_hash",
      "timestamp": "2024-02-09T01:30:00Z",
      "qrCode": "base64_qr_code"
    }
  },
  "message": "Vote cast successfully"
}
```

**Errors:**
- 400: Already voted
- 401: Unauthorized
- 404: Election not found
- 422: Election not active
- 500: Blockchain error

---

### 5. Verify Vote
**GET** `/votes/verify/:voteId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "voteId": "uuid",
    "status": "CONFIRMED",
    "blockchainTxId": "0xabc123...",
    "timestamp": "2024-02-09T01:30:00Z",
    "verified": true
  }
}
```

---

### 6. Get Results
**GET** `/votes/results/:electionId`  
**Query Params:** `?district=uuid&type=PRELIMINARY`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "electionId": "uuid",
    "electionName": "General Election 2024",
    "status": "COMPLETED",
    "totalVotes": 10000,
    "results": [
      {
        "candidateId": "uuid",
        "candidateName": "Candidate A",
        "partyName": "Party X",
        "voteCount": 4500,
        "percentage": 45.0,
        "rank": 1
      }
    ],
    "generatedAt": "2024-02-09T01:30:00Z"
  }
}
```

---

## Election Management Endpoints

### 7. Create Election
**POST** `/elections`  
**Auth:** Admin only

**Request:**
```json
{
  "electionName": "General Election 2024",
  "electionType": "GENERAL",
  "description": "National general election",
  "startDate": "2024-03-15T06:00:00Z",
  "endDate": "2024-03-15T18:00:00Z",
  "region": "National"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "electionId": "uuid",
    "status": "SCHEDULED"
  }
}
```

---

### 8. List Elections
**GET** `/elections`  
**Query:** `?status=ONGOING&region=National`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "elections": [
      {
        "electionId": "uuid",
        "electionName": "General Election 2024",
        "status": "ONGOING",
        "startDate": "2024-03-15T06:00:00Z",
        "totalVotes": 5000
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  }
}
```

---

## Candidate Endpoints

### 9. Add Candidate
**POST** `/candidates`  
**Auth:** Admin only

**Request:**
```json
{
  "electionId": "uuid",
  "candidateName": "John Smith",
  "partyName": "Democratic Party",
  "partySymbol": "🦅",
  "age": 45,
  "manifesto": "Policy platform...",
  "photoUrl": "https://cdn.example.com/photo.jpg"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "candidateId": "uuid",
    "status": "ACTIVE"
  }
}
```

---

### 10. List Candidates
**GET** `/candidates/:electionId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "candidateId": "uuid",
        "candidateName": "John Smith",
        "partyName": "Democratic Party",
        "partySymbol": "🦅",
        "photoUrl": "url"
      }
    ]
  }
}
```

---

## Audit Endpoints

### 11. Get Audit Logs
**GET** `/audit`  
**Auth:** Observer/Admin only  
**Query:** `?eventType=VOTE_CAST&startDate=2024-01-01&limit=100`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "logId": "uuid",
        "eventType": "VOTE_CAST",
        "userId": "uuid",
        "timestamp": "2024-02-09T01:30:00Z",
        "success": true,
        "metadata": {}
      }
    ],
    "pagination": {
      "total": 1000,
      "page": 1,
      "limit": 100
    }
  }
}
```

---

## Complete Endpoint List

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | /auth/register | No | Public | Register voter |
| POST | /auth/biometric | No | Public | Biometric auth |
| POST | /auth/admin/login | No | Public | Admin login |
| POST | /votes/cast | Yes | Voter | Cast vote |
| GET | /votes/verify/:id | No | Public | Verify vote |
| GET | /votes/results/:electionId | No | Public | Get results |
| POST | /elections | Yes | Admin | Create election |
| GET | /elections | Yes | All | List elections |
| PUT | /elections/:id | Yes | Admin | Update election |
| POST | /candidates | Yes | Admin | Add candidate |
| GET | /candidates/:electionId | No | Public | List candidates |
| GET | /audit | Yes | Observer | Audit logs |
| GET | /terminals | Yes | Admin | List terminals |
| POST | /terminals/authorize | Yes | Admin | Authorize MAC |

---

## Request Headers

**All Requests:**
```
Content-Type: application/json
Accept: application/json
```

**Authenticated Requests:**
```
Authorization: Bearer <jwt_token>
```

**IoT Terminal Requests:**
```
X-Terminal-MAC: 00:1B:44:11:3A:B7
X-Terminal-ID: TERM-001
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 429 | Rate Limit Exceeded |
| 500 | Server Error |
| 503 | Service Unavailable |

---

## Rate Limiting

**Default:** 100 requests / 15 minutes per IP  
**Voting:** 10 requests / hour per voter  
**Admin:** 1000 requests / hour

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

**See:** [`openapi.yaml`](file:///Users/ayush/Documents/GitHub/ElectionManagement/docs/api/openapi.yaml) for complete OpenAPI 3.0 specification

**Document Version:** 1.0  
**Last Updated:** February 2024
