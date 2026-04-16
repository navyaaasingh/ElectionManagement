import { api } from './client.js';

export function getEligibilityPolicy(electionId) {
  return api.get(`/api/v1/eligibility/policies?electionId=${encodeURIComponent(electionId)}`);
}

export function createEligibilityPolicy(payload) {
  return api.post('/api/v1/eligibility/policies', payload);
}

export function updateEligibilityPolicy(policyId, payload) {
  return api.put(`/api/v1/eligibility/policies/${policyId}`, payload);
}

export function bulkValidateEligibility(payload) {
  return api.post('/api/v1/eligibility/bulk-validate', payload);
}
