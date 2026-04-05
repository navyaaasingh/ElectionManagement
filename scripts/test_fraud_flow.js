const axios = require('axios');
const logger = require('../backend/src/utils/logger.js');

const BACKEND_URL = 'http://localhost:3000/api/v1/audit/alerts';
const API_KEY = process.env.ML_SERVICE_API_KEY || 'ml-internal-secret';

/**
 * Simulate a fraud detection event from the ML service
 */
async function simulateFraudAlert() {
    console.log('🚀 Simulating Fraud Detection Event...');

    const payload = {
        alertType: 'FRAUD_DETECTED',
        severity: 'HIGH',
        voteId: 'VOTE_SIM_' + Math.random().toString(36).substring(7),
        voterId: 'VOTER_TEST_123',
        terminalId: 'TERM_DUMMY_99',
        district: 'D_CENTRAL',
        electionId: 'ELEC_2026_MAIN',
        reason: 'Isolation Forest: Voting velocity exceeds threshold (5 votes/sec)',
        confidence: 0.94,
        anomalyScore: 9.4,
        detectedAt: new Date().toISOString()
    };

    try {
        const response = await axios.post(BACKEND_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-ml-api-key': API_KEY
            }
        });

        if (response.status === 201) {
            console.log('✅ Fraud Alert Recorded Successfully!');
            console.log('🔗 Alert ID:', response.data.alertId);
            console.log('📡 Expected WebSocket Event: FRAUD_ALERT');
        } else {
            console.error('❌ Failed to post alert:', response.status, response.data);
        }
    } catch (error) {
        console.error('❌ Network Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
    }
}

// Check if running directly
if (require.main === module) {
    simulateFraudAlert();
}
