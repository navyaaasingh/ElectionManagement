process.env.NODE_ENV = 'development';
process.env.USE_SQLITE = 'true';

const request = require('supertest');
const app = require('../src/server');
const { sequelize } = require('../src/db');

describe('Authentication API', () => {
    beforeAll(async () => {
        // Setup test database
        await sequelize.sync({ force: true });
    });

    describe('POST /api/v1/auth/register', () => {
        it('should register a new voter', async () => {
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    aadharNumber: '123456789012',
                    biometricTemplate: 'simulated_hash_123',
                    districtId: 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb',
                    email: 'voter@example.com',
                    phoneNumber: '+911234567890',
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('voterId');
        });

        it('should reject duplicate Aadhar number', async () => {
            // Register first time
            await request(app)
                .post('/api/v1/auth/register')
                .send({
                    aadharNumber: '999999999999',
                    biometricTemplate: 'hash',
                    districtId: 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb',
                });

            // Try to register again
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    aadharNumber: '999999999999',
                    biometricTemplate: 'different_hash',
                    districtId: 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb',
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/v1/auth/biometric', () => {
        let registeredVoter;

        beforeEach(async () => {
            // Register a voter for authentication tests
            const register = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    aadharNumber: '111111111111',
                    biometricTemplate: 'test_biometric_hash',
                    districtId: 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb',
                });

            registeredVoter = register.body;
        });

        it('should authenticate voter with valid biometric', async () => {
            const response = await request(app)
                .post('/api/v1/auth/biometric')
                .send({
                    biometricTemplate: 'test_biometric_hash',
                    terminalId: 'TERMINAL_001',
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
                    terminalId: 'TERMINAL_001',
                });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/v1/auth/admin/login', () => {
        it('should login admin with valid credentials', async () => {
            const response = await request(app)
                .post('/api/v1/auth/admin/login')
                .send({
                    username: 'admin',
                    password: 'admin123', // Default admin password
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
            expect(response.body.success).toBe(false);
        });
    });
});

describe('Vote Casting API', () => {
    let voterToken;
    let voterId;

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        // Register and authenticate a voter
        const register = await request(app)
            .post('/api/v1/auth/register')
            .send({
                aadharNumber: '222222222222',
                biometricTemplate: 'voter_hash',
                districtId: 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb',
            });

        voterId = register.body.voterId;

        const auth = await request(app)
            .post('/api/v1/auth/biometric')
            .send({
                biometricTemplate: 'voter_hash',
                terminalId: 'TERMINAL_001',
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
                    electionId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
                    candidateId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
                    district: 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb',
                    biometricHash: 'voter_hash',
                    terminalId: 'TERMINAL_001',
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('voteId');
        });

        it('should prevent double voting', async () => {
            // Try to vote again
            const response = await request(app)
                .post('/api/v1/votes/cast')
                .set('Authorization', `Bearer ${voterToken}`)
                .send({
                    voterId,
                    electionId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
                    candidateId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
                    district: 'd4d5fa69-2142-4e26-b7aa-8e5177a3d7bb',
                    biometricHash: 'voter_hash',
                    terminalId: 'TERMINAL_001',
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('already voted');
        });
    });

    describe('GET /api/v1/votes/status/:voterId/:electionId', () => {
        it('should return voter status', async () => {
            const response = await request(app)
                .get(`/api/v1/votes/status/${voterId}/d290f1ee-6c54-4b01-90e6-d701748f0851`)
                .set('Authorization', `Bearer ${voterToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasVoted).toBe(true);
        });
    });
});

afterAll(async () => {
    await sequelize.close();
});
