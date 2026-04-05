/**
 * ML Traffic Simulator for CampusVote Demo
 * 
 * This script generates synthetic voting traffic and periodic fraud alerts
 * to demonstrate the real-time ML Monitoring dashboard.
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
const ML_API_KEY = process.env.ML_SERVICE_API_KEY || 'ml-internal-secret';

const terminals = ['TERM-A1', 'TERM-A2', 'TERM-B1', 'TERM-C4'];
const districts = ['North Campus', 'Engineering Quad', 'Medical Center', 'Arts District'];

async function triggerVote() {
  const terminalId = terminals[Math.floor(Math.random() * terminals.length)];
  const district = districts[Math.floor(Math.random() * districts.length)];
  
  console.log(`📡 Simulating Vote: ${terminalId} (${district})`);
  
  // Note: We don't actually need to cast a real vote to triggr the UI if we just want to test alerts,
  // but casting a real vote triggers the VOTE_CAST socket event in a real environment.
  // For the demo, we can just hit the alerts endpoint with "Normal" noise or just use the test_fraud_flow.
}

async function triggerAlert(severity = 'MEDIUM', reason = 'Suspicious voting velocity detected') {
  const terminalId = terminals[Math.floor(Math.random() * terminals.length)];
  const district = districts[Math.floor(Math.random() * districts.length)];
  
  console.log(`🚨 Triggering ${severity} Alert: ${reason}`);
  
  try {
    await axios.post(`${API_URL}/audit/alerts`, {
      alertType: 'FRAUD_DETECTED',
      severity,
      terminalId,
      district,
      reason,
      confidence: 0.85 + Math.random() * 0.1,
      anomalyScore: 0.7 + Math.random() * 0.2,
      detectedAt: new Date().toISOString()
    }, {
      headers: { 'x-ml-api-key': ML_API_KEY }
    });
  } catch (err) {
    console.error('❌ Failed to trigger alert:', err.response?.data || err.message);
  }
}

async function run() {
  console.log('🚀 Starting ML Traffic Simulator...');
  console.log('--- Press Ctrl+C to stop ---');

  // Trigger an initial alert
  await triggerAlert('MEDIUM', 'Initialization sequence complete. Monitoring cluster.');

  // Interval for "Noise" (Normal operations / low velocity updates)
  setInterval(async () => {
    // In a real system, VOTE_CAST comes from the vote service.
    // Here we can just trigger a dummy alert or noise if we want.
    console.log('... Monitoring traffic ...');
  }, 5000);

  // Interval for "Anomalies"
  setInterval(async () => {
    const reasons = [
      'Sequential ID mismatch at terminal',
      'Rapid burst voting pattern (20+ votes/min)',
      'Multiple concurrent logins for single VoterID',
      'Geospatial anomaly: Terminal heartbeat mismatch'
    ];
    const r = reasons[Math.floor(Math.random() * reasons.length)];
    await triggerAlert(Math.random() > 0.8 ? 'HIGH' : 'MEDIUM', r);
  }, 12000);
}

run();
