const bcrypt = require('bcryptjs');
const { Voter, District, sequelize } = require('./src/models');
const { initializeDatabases } = require('./src/db/index.js');

async function create() {
    process.env.NODE_ENV = 'development';
    
    await initializeDatabases();
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    try {
        let district = await District.findOne();
        if (!district) {
            district = await District.create({ name: 'Central Campus', code: 'CEN01', state: 'Delhi', country: 'India', population: 5000 });
        }
        
        await Voter.create({
            roll_number: 'E2E-TEST-002',
            email: 'voter2@example.com',
            password: hashedPassword,
            full_name: 'E2E Test Voter 2',
            aadhar_number: '123456789013',
            biometric_hash: 'E2E_TEST_HASH_00000000000000000000000000000000000000000000000000000000',
            district_id: district.district_id,
            status: 'pending',
            is_approved: false,
            is_biometric_registered: false,
            aadhaar_verified: false,
            has_voted: false,
            is_active: true
        });
        console.log('✅ Test voter created!');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
create();
