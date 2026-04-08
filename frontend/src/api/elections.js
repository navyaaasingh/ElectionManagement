import { api } from './client.js';

/**
 * Get the currently active election (with its candidates).
 */
export function getCurrentElection() {
  return api.get('/api/v1/elections/current');
}

/**
 * Get all elections with optional filters.
 * @param {{ status?, type?, limit?, offset? }} params
 */
export function getElections(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/api/v1/elections${qs ? '?' + qs : ''}`);
}

/**
 * Get a single election by ID.
 */
export function getElection(id) {
  return api.get(`/api/v1/elections/${id}`);
}

/**
 * Create a new election (admin only - requires admin JWT).
 */
export function createElection(data) {
  return api.post('/api/v1/elections', data);
}

/**
 * Update election details (admin only).
 */
export function updateElection(id, data) {
  return api.put(`/api/v1/elections/${id}`, data);
}

/**
 * Change election status: upcoming → active → completed | cancelled.
 */
export function updateElectionStatus(id, status) {
  return api.put(`/api/v1/elections/${id}/status`, { status });
}

export function proposeElectionStatus(id, status, notes = '') {
  return api.post(`/api/v1/elections/${id}/status/propose`, { status, notes });
}

export function approveElectionStatusProposal(electionId, proposalId) {
  return api.post(`/api/v1/elections/${electionId}/status/proposals/${proposalId}/approve`, {});
}

export function getElectionStatusProposals(electionId) {
  return api.get(`/api/v1/elections/${electionId}/status/proposals`);
}

/**
 * Delete an election (admin only, upcoming only).
 */
export function deleteElection(id) {
  return api.delete(`/api/v1/elections/${id}`);
}

/**
 * Get candidates for a given election.
 */
export function getCandidates(electionId, params = {}) {
  const qs = new URLSearchParams({ electionId, ...params }).toString();
  return api.get(`/api/v1/candidates?${qs}`);
}

/**
 * Add a candidate (admin only).
 */
export function addCandidate(data) {
  return api.post('/api/v1/candidates', data);
}
