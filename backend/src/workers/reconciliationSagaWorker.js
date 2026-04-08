const { initializeDatabases, closeDatabases } = require('../db/index.js');
const reconciliationSaga = require('../services/reconciliationSaga.service.js');
const mlHealthService = require('../services/mlHealth.service.js');

const start = async () => {
    await initializeDatabases();
    reconciliationSaga.start();
    mlHealthService.start();
    console.log('Reconciliation saga worker started');
};

const shutdown = async () => {
    reconciliationSaga.stop();
    mlHealthService.stop();
    await closeDatabases();
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(async (error) => {
    console.error('Failed to start reconciliation worker:', error.message);
    await closeDatabases();
    process.exit(1);
});
