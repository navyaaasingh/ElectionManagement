const { sequelize } = require('./src/db/index.js');
const { randomUUID } = require('crypto');
const Candidate = require('./src/models/candidate.model.js');
const Voter = require('./src/models/voter.model.js');

async function seedData() {
    try {
        await sequelize.authenticate();
        console.log('Connected to PostgreSQL for seeding.');

        // 1. Get or Create a District
        let [districts] = await sequelize.query(`SELECT district_id FROM districts LIMIT 1`);
        let districtId;
        
        if (districts.length > 0) {
            districtId = districts[0].district_id;
            console.log('Using existing district:', districtId);
        } else {
            districtId = randomUUID();
            await sequelize.query(`INSERT INTO districts (district_id, name, state, country, created_at, updated_at) VALUES ('${districtId}', 'Main Campus', 'MH', 'India', NOW(), NOW())`);
            console.log('Created new district:', districtId);
        }

        // 2. Create an Election
        const Election = require('./src/models/election.model.js');
        const electionId = randomUUID();
        
        await Election.create({
            election_id: electionId,
            name: 'Annual Student Council 2026',
            description: 'Main institutional election for student leadership',
            election_type: 'INSTITUTIONAL',
            start_date: new Date(),
            end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            status: 'ACTIVE'
        });
        
        console.log('Created new election:', electionId);

        // 3. Seed Candidates
        const candidates = [
            {
                candidate_id: randomUUID(),
                election_id: electionId,
                district_id: districtId,
                full_name: 'Dr. Sarah Chen',
                party_name: 'Digital Integrity Party',
                position_title: 'General Secretary',
                biography: 'A computer science professor specialized in decentralized systems and zero-knowledge proofs.',
                manifesto_summary: 'I propose building a fully transparent, blockchain-verified campus voting system with automated student verification and paper-trail audits.',
                candidate_photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200&h=200',
                status: 'active'
            },
            {
                candidate_id: randomUUID(),
                election_id: electionId,
                district_id: districtId,
                full_name: 'Marcus Thorne',
                party_name: 'Student First Alliance',
                position_title: 'General Secretary',
                biography: 'A third-year political science major with 4 years of experience in student government and community organizing.',
                manifesto_summary: 'My focus is on enhancing the physical student experience: improving campus Wi-Fi, expanding the library hours to 24/7, and modernizing the sports facilities.',
                candidate_photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200&h=200',
                status: 'active'
            }
        ];

        console.log('--- Cleaning Candidates for this election ---');
        await Candidate.destroy({ where: { election_id: electionId } });
        await Candidate.bulkCreate(candidates);
        console.log('✅ Successfully seeded 2 Candidates.');

        // 4. Seed a test Voter
        const testVoter = {
            voter_id: randomUUID(),
            full_name: 'Demo Student',
            aadhar_number: '123456789012',
            biometric_hash: 'SHA256_HASH_' + Date.now(),
            district_id: districtId,
            status: 'active'
        };

        console.log('--- Cleaning/Seeding Test Voter ---');
        await Voter.destroy({ where: { aadhar_number: testVoter.aadhar_number } });
        await Voter.create(testVoter);
        console.log('✅ Successfully seeded 1 Test Voter.');

        console.log('\n🌟 Seeding complete! These candidates will now show on your website.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedData();
