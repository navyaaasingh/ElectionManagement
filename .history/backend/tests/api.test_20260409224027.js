process.env.NODE_ENV = 'development';
process.env.USE_SQLITE = 'true';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { sequelize } = require('../src/db');
const { District, Election, Candidate, AdminUser } = require('../src/models/index.js');

const DISTRICT_ID = 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb';
const ELECTION_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const CANDIDATE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TERMINAL_ID = '11111111-2222-3333-4444-555555555555';

async function seedCoreData() {
    await sequelize.sync({ force: true });

    await District.create({
        district_id: DISTRICT_ID,
        name: 'Test District',
        state: 'Maharashtra',
        country: 'India',
    });

    const passwordHash = await bcrypt.hash('admin123', 12);
    await AdminUser.create({
        username: 'admin',
        email: 'admin@example.com',
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        district_id: DISTRICT_ID,
        is_active: true,
    });

    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS iot_terminals (
            terminal_id TEXT PRIMARY KEY,
            district_id TEXT,
            status TEXT,
            created_at DATETIME,
            updated_at DATETIME
        )
    `);

    await sequelize.query(
        `INSERT OR REPLACE INTO iot_terminals (terminal_id, district_id, status, created_at, updated_at)
         VALUES (:terminalId, :districtId, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        {
            replacements: {
                terminalId: TERMINAL_ID,
                districtId: DISTRICT_ID,
            },
        }
    );

    await Election.create({
        election_id: ELECTION_ID,
        name: 'Test Election',
        description: 'Integration test election',
        election_type: 'INSTITUTIONAL',
        start_date: new Date(Date.now() - 60 * 60 * 1000),
        end_date: new Date(Date.now() + 60 * 60 * 1000),
        status: 'ACTIVE',
    });

    await Candidate.create({
        candidate_id: CANDIDATE_ID,
        election_id: ELECTION_ID,
        district_id: DISTRICT_ID,
        full_name: 'Candidate One',
        party_name: 'Student Front',
        party_symbol: 'SF',
        status: 'active',
    });
}

describe('Authentication API', () => {
    beforeAll(async () => {
        await seedCoreData();
    });

    describe('POST /api/v1/auth/register-voter', () => {
        it('should register a new voter', async () => {
            const response = await request(app)
                .post('/api/v1/auth/register-voter')
                .send({
                    aadharNumber: '123456789012',
                    fullName: 'Test Voter',
                    biometricTemplate: 'simulated_hash_123',
                    districtId: DISTRICT_ID,
                    email: 'voter@example.com',
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.voter).toHaveProperty('voterId');
        });

        it('should reject duplicate Aadhar number', async () => {
            await request(app)
                .post('/api/v1/auth/register-voter')
                .send({
                    aadharNumber: '999999999999',
                    fullName: 'Duplicate Voter',
                    biometricTemplate: 'hash_1',
                    districtId: DISTRICT_ID,
                });

            const response = await request(app)
                .post('/api/v1/auth/register-voter')
                .send({
                    aadharNumber: '999999999999',
                    fullName: 'Duplicate Voter 2',
                    biometricTemplate: 'hash_2',
                    districtId: DISTRICT_ID,
                });

            expect(response.status).toBe(409);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('POST /api/v1/auth/biometric', () => {
        it('should authenticate voter with valid biometric', async () => {
            await request(app)
                .post('/api/v1/auth/register-voter')
                .send({
                    aadharNumber: '111111111111',
                    fullName: 'Bio Voter',
                    biometricTemplate: 'test_biometric_hash',
                    districtId: DISTRICT_ID,
                });

            const response = await request(app)
                .post('/api/v1/auth/biometric')
                .send({
                    biometricTemplate: 'test_biometric_hash',
                    terminalId: TERMINAL_ID,
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('voter');
        });

        it('should reject invalid biometric', async () => {
            const response = await request(app)
                .post('/api/v1/auth/biometric')
                .send({
                    biometricTemplate: 'wrong_hash',
                    terminalId: TERMINAL_ID,
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('POST /api/v1/auth/admin/login', () => {
        it('should login admin with valid credentials', async () => {
            const response = await request(app)
                .post('/api/v1/auth/admin/login')
                .send({
                    username: 'admin',
                    password: 'admin123',
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('token');
        });

        it('should reject invalid admin credentials', async () => {
            const response = await request(app)
                .post('/api/v1/auth/admin/login')
                .send({
                    username: 'admin',
                    password: 'wrongpassword',
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toBeDefined();
        });
    });
});

describe('Vote Casting API', () => {
    let voterToken;
    let voterId;

    beforeAll(async () => {
        const register = await request(app)
            .post('/api/v1/auth/register-voter')
            .send({
                aadharNumber: '222222222222',
                fullName: 'Vote Voter',
                biometricTemplate: 'voter_hash',
                districtId: DISTRICT_ID,
            });

        voterId = register.body?.voter?.voterId;

        const auth = await request(app)
            .post('/api/v1/auth/biometric')
            .send({
                biometricTemplate: 'voter_hash',
                terminalId: TERMINAL_ID,
            });

        voterToken = auth.body.token;
    });

    describe('POST /api/v1/votes/cast', () => {
        it('should cast a vote successfully', async () => {
            const response = await request(app)
                .post('/api/v1/votes/cast')
                .set('Authorization', `Bearer ${voterToken}`)
                .send({
                    voterId,
                    electionId: ELECTION_ID,
                    candidateId: CANDIDATE_ID,
                    district: DISTRICT_ID,
                    biometricHash: 'voter_hash',
                    terminalId: TERMINAL_ID,
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('voteId');
        });

        it('should prevent double voting', async () => {
            const response = await request(app)
                .post('/api/v1/votes/cast')
                .set('Authorization', `Bearer ${voterToken}`)
                .send({
                    voterId,
                    electionId: ELECTION_ID,
                    candidateId: CANDIDATE_ID,
                    district: DISTRICT_ID,
                    biometricHash: 'voter_hash',
                    terminalId: TERMINAL_ID,
                });

            expect([409, 500]).toContain(response.status);
            expect(response.body.error).toBeDefined();
            const message = String(response.body.message || '').toLowerCase();
            expect(
                message.includes('already voted') ||
                message.includes('unique') ||
                message.includes('constraint')
            ).toBe(true);
        });
    });

    describe('GET /api/v1/votes/status/:voterId/:electionId', () => {
        it('should return voter status', async () => {
            const response = await request(app)
                .get(`/api/v1/votes/status/${voterId}/${ELECTION_ID}`)
                .set('Authorization', `Bearer ${voterToken}`);

            expect(response.status).toBe(200);
            expect(response.body.hasVoted).toBe(true);
            expect(response.body.votingRecord).toBeTruthy();
        });
    });
});

afterAll(async () => {
    await sequelize.close();
});
