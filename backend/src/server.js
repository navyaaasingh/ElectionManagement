const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const promClient = require('prom-client');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { initializeDatabases, closeDatabases } = require('./db/index.js');
const { initWebSocketServer } = require('./services/websocket.service.js');
const { initKafkaProducer, disconnectKafkaProducer } = require('./services/kafkaProducer.js');
const reconciliationSaga = require('./services/reconciliationSaga.service.js');

// Load environment variables
dotenv.config();

// Global Error Handlers - Catching everything that escapes try-catch
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, you might want to restart gracefully here
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    console.error(error.stack);
    process.exit(1);
});

// Import routes
const authRoutes = require('./routes/auth.routes.js');
const voteRoutes = require('./routes/vote.routes.js');
const electionRoutes = require('./routes/election.routes.js');
const candidateRoutes = require('./routes/candidate.routes.js');
const resultsRoutes = require('./routes/results.routes.js');
const auditRoutes = require('./routes/audit.routes.js');
const voterRoutes = require('./routes/voter.routes.js');
const studentRoutes = require('./routes/student.routes.js');
const operationsRoutes = require('./routes/operations.routes.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Prometheus Metrics setup
promClient.collectDefaultMetrics({ prefix: 'election_backend_' });

// Security middleware
app.use(helmet());

// Enforce HTTPS in production
app.enable('trust proxy');
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.redirect(`https://${req.get('host')}${req.originalUrl}`);
    }
    next();
});

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
const corsOptions = {
    origin: corsOrigins,
    credentials: true,
};
app.use(cors(corsOptions));

if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET is not set. Using default secret reduces security.');
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const logger = require('./utils/logger.js');

app.use((req, res, next) => {
  logger.info('API_REQUEST', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'election-management-api',
        version: '1.0.0',
    });
});

app.get('/ready', (req, res) => {
    res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        service: 'election-management-api',
    });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.send(await promClient.register.metrics());
});

// Mount API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/votes', voteRoutes);
app.use('/api/v1/elections', electionRoutes);
app.use('/api/v1/candidates', candidateRoutes);
app.use('/api/v1/results', resultsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/voters', voterRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/operations', operationsRoutes);

// Mock blockchain route for Verification Portal demo
const blockchainMockRoutes = require('./routes/blockchain.mock.routes.js');
app.use('/api/blockchain', blockchainMockRoutes);

// API root endpoint
app.get('/api/v1', (req, res) => {
    res.json({
        message: 'Election Management System API v1',
        endpoints: {
            auth: '/api/v1/auth',
            votes: '/api/v1/votes',
            candidates: '/api/v1/candidates',
            elections: '/api/v1/elections',
        },
    });
});

// ML Service Proxy — forward /api/ml/* to the Python Flask service
// Note: Express strips the mount prefix from req.url, so req.url is the remainder after /api/ml
// Flask routes are defined at /health, /api/ml/analyze etc. We re-add /api/ml for analyze/batch routes.
app.use('/api/ml', (req, res) => {
    const mlBaseUrl = process.env.PYTHON_ML_SERVICE_URL || 'http://localhost:5000';
    // req.url here is e.g. '/analyze', '/batch-analyze', '/health'
    // Flask exposes /health at root and /api/ml/analyze etc at /api/ml/...
    const flaskPath = req.url === '/health' ? '/health' : `/api/ml${req.url}`;
    const targetUrl = new URL(flaskPath, mlBaseUrl);
    const isHttps = targetUrl.protocol === 'https:';
    const mod = isHttps ? https : http;

    const options = {
        hostname: targetUrl.hostname,
        port:     targetUrl.port || (isHttps ? 443 : 80),
        path:     targetUrl.pathname + (targetUrl.search || ''),
        method:   req.method,
        headers:  { 
            ...req.headers, 
            host: targetUrl.hostname,
            'x-ml-api-key': process.env.ML_SERVICE_API_KEY || 'ml-internal-secret'
        },
    };

    const proxyReq = mod.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        logger.error('ML_PROXY_ERROR', { error: err.message });
        res.status(502).json({ error: 'ML service unavailable', detail: err.message });
    });

    req.pipe(proxyReq, { end: true });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: {
            message: 'Route not found',
            status: 404,
            path: req.path,
        },
    });
});

// Initialize databases and start server
const startServer = async () => {
    try {
        // Connect to all databases
        await initializeDatabases();

        console.log('🚀 Finalizing service initialization...');
        try {
            await initKafkaProducer();
        } catch (error) {
            console.warn('⚠️  Kafka Producer initialization failed. Event streaming disabled.');
        }
        reconciliationSaga.start();

        // Start HTTP server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Server running on all interfaces at port ${PORT}`);
            console.log(`   Health check: http://localhost:${PORT}/health`);
            console.log(`   API endpoint: http://localhost:${PORT}/api/v1`);
        });

        // Initialize WebSocket Server
        initWebSocketServer(server);
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use. Please kill the process using it.`);
        } else {
            console.error('❌ Failed to start server:', error.message);
            console.error(error.stack);
        }
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('\n🛑 SIGTERM received, shutting down gracefully...');
    reconciliationSaga.stop();
    await disconnectKafkaProducer();
    await closeDatabases();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 SIGINT received, shutting down gracefully...');
    reconciliationSaga.stop();
    await disconnectKafkaProducer();
    await closeDatabases();
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;
