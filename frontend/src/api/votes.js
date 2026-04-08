import { api } from './client.js';

/**
 * Cast a vote.
 * @param {{
 *   voterId, electionId, candidateId,
 *   district, biometricHash, terminalId,
 *   zkpCommitment?, encryptedVote?
 * }} payload
 */
export function castVote(payload) {
  return api.post('/api/v1/votes/cast', payload);
}

/**
 * Check whether a voter has already voted in an election.
 */
export function getVoterStatus(voterId, electionId) {
  return api.get(`/api/v1/votes/status/${voterId}/${electionId}`);
}

/**
 * Verify a vote by its receipt ID (verification hash).
 */
export function verifyReceipt(receiptId) {
  return api.get(`/api/v1/votes/verify/${receiptId}`);
}

/**
 * Get election results (from blockchain + DB).
 */
export function getResults(electionId) {
  return api.get(`/api/v1/votes/results/${electionId}`);
}

export function raiseSOS(payload) {
  return api.post('/api/v1/votes/sos', payload);
}
