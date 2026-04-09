import { api } from './client.js';

/**
 * Get paginated voter list (admin only).
 */
export function getVoters(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/api/v1/voters${qs ? '?' + qs : ''}`);
}

/**
 * Get audit logs from MongoDB (admin only).
 */
export function getAuditLogs(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/api/v1/audit${qs ? '?' + qs : ''}`);
}

/**
 * Get detailed results for an election.
 */
export function getElectionResults(electionId) {
  return api.get(`/api/v1/results/${electionId}`);
}

/**
 * Get dashboard statistics summary.
 */
export function getDashboardStats() {
  return api.get('/api/v1/elections?limit=10&offset=0');
}

/**
 * Submit a candidate application (POST to /api/v1/candidates).
 * Used by CandidatePortal for self-registration.
 * @param {{ electionId, fullName, partyName, districtId, manifesto, email, phone, studentId, cgpa, year }} data
 */
export function submitCandidateApplication(data) {
  return api.post('/api/v1/candidates/applications', {
    electionId: data.electionId,
    name: data.name,
    studentId: data.studentId,
    email: data.email,
    phone: data.phone,
    department: data.department,
    year: data.year,
    cgpa: data.cgpa,
    manifesto: data.manifesto,
    partyName: data.department || 'Independent',
    partySymbol: data.year || '',
    districtId: data.districtId || null,
  });
}

/**
 * Get all candidates for an election (for status tracking).
 */
export function getCandidatesByElection(electionId) {
  const qs = new URLSearchParams({ electionId }).toString();
  return api.get(`/api/v1/candidates?${qs}`);
}

/**
 * Get voter registrations with student cross-reference (admin only).
 * Returns registered voters + unregistered students summary.
 */
export function getRegistrations(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/api/v1/auth/registrations${qs ? '?' + qs : ''}`);
}

/**
 * Approve a pending voter registration (admin only).
 */
export function approveVoter(voterId) {
  return api.put(`/api/v1/auth/registrations/${voterId}/approve`, {});
}

export function bulkValidateVoters(voters) {
  return api.post('/api/v1/auth/voters/bulk-validate', { voters });
}

export function bulkImportVoters(voters) {
  return api.post('/api/v1/auth/voters/bulk-import', { voters });
}
