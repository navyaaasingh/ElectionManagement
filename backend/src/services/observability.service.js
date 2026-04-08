const promClient = require('prom-client');

const getOrCreateMetric = (name, builder) => {
    const existing = promClient.register.getSingleMetric(name);
    if (existing) return existing;
    return builder();
};

const voteCastLatencyMs = getOrCreateMetric('vote_cast_latency_ms', () => new promClient.Histogram({
    name: 'vote_cast_latency_ms',
    help: 'End-to-end vote cast latency in milliseconds',
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
}));

const fabricCallLatencyMs = getOrCreateMetric('fabric_call_latency_ms', () => new promClient.Histogram({
    name: 'fabric_call_latency_ms',
    help: 'Fabric call latency in milliseconds',
    labelNames: ['method', 'outcome'],
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
}));

const fabricCircuitOpen = getOrCreateMetric('fabric_circuit_open', () => new promClient.Gauge({
    name: 'fabric_circuit_open',
    help: 'Fabric circuit breaker state: 1=open, 0=closed',
}));

const fabricFallbackTotal = getOrCreateMetric('fabric_fallback_total', () => new promClient.Counter({
    name: 'fabric_fallback_total',
    help: 'Number of times DB fallback path was used due to Fabric failure',
}));

const reconciliationProcessedTotal = getOrCreateMetric('reconciliation_processed_total', () => new promClient.Counter({
    name: 'reconciliation_processed_total',
    help: 'Number of outbox reconciliation events processed',
    labelNames: ['status'],
}));

const outboxPendingGauge = getOrCreateMetric('outbox_pending', () => new promClient.Gauge({
    name: 'outbox_pending',
    help: 'Current count of pending outbox events',
}));

const deadLetterPendingGauge = getOrCreateMetric('dead_letter_pending', () => new promClient.Gauge({
    name: 'dead_letter_pending',
    help: 'Current unresolved dead letter event count',
}));

const voteVelocityPerDistrict = getOrCreateMetric('vote_velocity_per_district', () => new promClient.Gauge({
    name: 'vote_velocity_per_district',
    help: 'Vote velocity (votes per hour) by district',
    labelNames: ['district_id'],
}));

const terminalOfflineCount = getOrCreateMetric('terminal_offline_count', () => new promClient.Gauge({
    name: 'terminal_offline_count',
    help: 'Number of offline terminals',
}));

const mlServiceHealthy = getOrCreateMetric('ml_service_healthy', () => new promClient.Gauge({
    name: 'ml_service_healthy',
    help: 'ML service health state: 1=healthy, 0=unhealthy',
}));

const mlHealthLatencyMs = getOrCreateMetric('ml_health_latency_ms', () => new promClient.Histogram({
    name: 'ml_health_latency_ms',
    help: 'ML health endpoint latency in milliseconds',
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2000],
}));

const sagaStateGauge = getOrCreateMetric('vote_saga_state_count', () => new promClient.Gauge({
    name: 'vote_saga_state_count',
    help: 'Current count of vote saga records by state',
    labelNames: ['state'],
}));

module.exports = {
    voteCastLatencyMs,
    fabricCallLatencyMs,
    fabricCircuitOpen,
    fabricFallbackTotal,
    reconciliationProcessedTotal,
    outboxPendingGauge,
    deadLetterPendingGauge,
    voteVelocityPerDistrict,
    terminalOfflineCount,
    mlServiceHealthy,
    mlHealthLatencyMs,
    sagaStateGauge,
};
