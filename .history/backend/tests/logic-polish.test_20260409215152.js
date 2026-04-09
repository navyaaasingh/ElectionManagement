const crypto = require('crypto');

jest.mock('../src/models/index.js', () => ({
    Candidate: {
        findAll: jest.fn(),
    },
    VotingRecord: {
        findAll: jest.fn(),
    },
    District: {
        findByPk: jest.fn(),
    },
}));

const { Candidate, VotingRecord } = require('../src/models/index.js');
const eligibilityService = require('../src/services/eligibilityService.js');
const fabricService = require('../src/services/fabricService.js');
const runoffService = require('../src/services/runoffService.js');

describe('Logic Polish - Remaining 5%', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Eligibility Engine', () => {
        test('validates malformed rule sets', () => {
            const validation = eligibilityService.validateRules({
                minAge: 30,
                maxAge: 18,
                allowedParties: 'not-an-array',
            });

            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('minAge cannot be greater than maxAge');
            expect(validation.errors).toContain('allowedParties must be an array');
        });

        test('rejects voter when age and party rules fail', async () => {
            const voter = {
                status: 'active',
                is_approved: true,
                aadhaar_verified: true,
                date_of_birth: '2012-01-01',
                party_affiliation: 'Independent',
                district_id: 'district-1',
                state: 'Maharashtra',
            };

            const election = {
                eligibility_rules: {
                    requireApproved: true,
                    requireAadhaarVerified: true,
                    minAge: 18,
                    allowedParties: ['student-union'],
                    allowedStates: ['Maharashtra'],
                },
            };

            const result = await eligibilityService.evaluateVoter(voter, election);
            expect(result.eligible).toBe(false);
            expect(result.reasons.some((reason) => reason.includes('Minimum age'))).toBe(true);
            expect(result.reasons.some((reason) => reason.includes('party affiliation'))).toBe(true);
        });
    });

    describe('Receipt Proofs (Full Merkle Path)', () => {
        test('verifies proof when root is top-level', () => {
            const hash = (input) => crypto.createHash('sha256').update(input).digest('hex');
            const leaf = 'vote-tx-1';
            const sibling = hash('sibling-node');
            const leafHash = hash(leaf);
            const root = hash(`${leafHash}${sibling}`);

            const proof = {
                leaf,
                merkle_root: root,
                path: [{ direction: 'right', siblingHash: sibling }],
            };

            expect(fabricService.verifyMerkleProof(proof, leaf)).toBe(true);
        });

        test('verifies proof when root is embedded in path tail', () => {
            const hash = (input) => crypto.createHash('sha256').update(input).digest('hex');
            const leaf = 'vote-tx-2';
            const sibling = hash('sibling-node-2');
            const leafHash = hash(leaf);
            const root = hash(`${leafHash}${sibling}`);

            const proof = {
                leaf,
                proof: [
                    { side: 'right', hash: sibling },
                    { root },
                ],
            };

            expect(fabricService.verifyMerkleProof(proof, leaf)).toBe(true);
        });
    });

    describe('Runoff Logic', () => {
        test('computes multi-round elimination winner', async () => {
            Candidate.findAll.mockResolvedValue([
                { candidate_id: 'cand-a' },
                { candidate_id: 'cand-b' },
                { candidate_id: 'cand-c' },
            ]);

            VotingRecord.findAll.mockResolvedValue([
                { ranking_payload: ['cand-a', 'cand-b', 'cand-c'], candidate_id: 'cand-a' },
                { ranking_payload: ['cand-a', 'cand-b', 'cand-c'], candidate_id: 'cand-a' },
                { ranking_payload: ['cand-a', 'cand-b', 'cand-c'], candidate_id: 'cand-a' },
                { ranking_payload: ['cand-b', 'cand-a', 'cand-c'], candidate_id: 'cand-b' },
                { ranking_payload: ['cand-b', 'cand-a', 'cand-c'], candidate_id: 'cand-b' },
                { ranking_payload: ['cand-b', 'cand-a', 'cand-c'], candidate_id: 'cand-b' },
                { ranking_payload: ['cand-c', 'cand-b', 'cand-a'], candidate_id: 'cand-c' },
            ]);

            const election = {
                election_id: 'election-1',
                runoff_config: {
                    mode: 'multi_round_elimination',
                    majorityThresholdPct: 50,
                    maxRounds: 5,
                },
            };

            const result = await runoffService.calculateRunoff(election);

            expect(result.mode).toBe('multi_round_elimination');
            expect(result.rounds.length).toBeGreaterThanOrEqual(2);
            expect(result.eliminated).toContain('cand-c');
            expect(result.winner.candidateId).toBe('cand-b');
        });
    });
});