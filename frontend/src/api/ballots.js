import { api } from './client.js';

export function issueBallotToken(payload) {
  return api.post('/api/v1/ballots/issue', payload);
}

export function consumeBallotToken(payload) {
  return api.post('/api/v1/ballots/consume', payload);
}
