const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('../utils/logger.js');
const { mlServiceHealthy, mlHealthLatencyMs } = require('./observability.service.js');

class MlHealthService {
    constructor() {
        this.last = {
            healthy: false,
            statusCode: null,
            latencyMs: null,
            checkedAt: null,
            error: null,
        };
        this.timer = null;
    }

    async checkOnce() {
        const base = process.env.PYTHON_ML_SERVICE_URL || 'http://localhost:5001';
        const url = new URL('/health', base);
        const mod = url.protocol === 'https:' ? https : http;
        const started = Date.now();

        return new Promise((resolve) => {
            const req = mod.request({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'GET',
                timeout: Number(process.env.ML_HEALTH_TIMEOUT_MS || 3000),
                headers: {
                    'x-ml-api-key': process.env.ML_SERVICE_API_KEY || 'ml-internal-secret',
                },
            }, (resp) => {
                const latencyMs = Date.now() - started;
                mlHealthLatencyMs.observe(latencyMs);
                const healthy = resp.statusCode >= 200 && resp.statusCode < 300;
                mlServiceHealthy.set(healthy ? 1 : 0);
                this.last = {
                    healthy,
                    statusCode: resp.statusCode,
                    latencyMs,
                    checkedAt: new Date().toISOString(),
                    error: healthy ? null : `HTTP_${resp.statusCode}`,
                };
                resolve(this.last);
            });

            req.on('timeout', () => req.destroy(new Error('ML health timeout')));
            req.on('error', (error) => {
                const latencyMs = Date.now() - started;
                mlHealthLatencyMs.observe(latencyMs);
                mlServiceHealthy.set(0);
                this.last = {
                    healthy: false,
                    statusCode: null,
                    latencyMs,
                    checkedAt: new Date().toISOString(),
                    error: error.message,
                };
                logger.warn('ML health check failed', { error: error.message });
                resolve(this.last);
            });
            req.end();
        });
    }

    start() {
        if (this.timer) return;
        const intervalMs = Number(process.env.ML_HEALTH_POLL_MS || 15000);
        this.timer = setInterval(() => {
            this.checkOnce().catch(() => {});
        }, intervalMs);
        this.checkOnce().catch(() => {});
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    getStatus() {
        return this.last;
    }
}

module.exports = new MlHealthService();
