const { Op } = require('sequelize');
const { OutboxEvent, DeadLetterEvent, VoteSagaStatus } = require('../models/index.js');
const { sequelize } = require('../db/index.js');
const fabricService = require('./fabricService.js');
const logger = require('../utils/logger.js');
const {
    reconciliationProcessedTotal,
    outboxPendingGauge,
    deadLetterPendingGauge,
} = require('./observability.service.js');

class ReconciliationSagaService {
    constructor() {
        this.intervalHandle = null;
        this.running = false;
    }

    async enqueueVoteSync(payload, transaction = null) {
        return OutboxEvent.create({
            aggregate_type: 'vote',
            aggregate_id: String(payload?.voteId || payload?.recordId || payload?.voterId || ''),
            event_type: 'VOTE_SYNC_TO_BLOCKCHAIN',
            payload,
            status: 'PENDING',
            next_attempt_at: new Date(),
        }, transaction ? { transaction } : undefined);
    }

    async enqueueDeadLetter({ sourceEventId = null, eventType, payload, errorMessage }) {
        try {
            await DeadLetterEvent.create({
                source_event_id: sourceEventId,
                source_table: 'outbox_events',
                event_type: eventType || 'UNKNOWN',
                payload: payload || {},
                error_message: String(errorMessage || 'Unknown reconciliation error').slice(0, 4000),
                failure_count: 1,
                resolved: false,
            });
        } catch (error) {
            logger.error('Failed to enqueue dead letter event', { error: error.message });
        }
    }

    async processOutboxBatch(limit = Number(process.env.OUTBOX_BATCH_SIZE || 100)) {
        const tx = await sequelize.transaction();
        try {
            const dialect = sequelize.getDialect();
            const events = await OutboxEvent.findAll({
                where: {
                    status: 'PENDING',
                    next_attempt_at: { [Op.lte]: new Date() },
                },
                order: [['created_at', 'ASC']],
                limit,
                transaction: tx,
                ...(dialect === 'postgres' ? { lock: tx.LOCK.UPDATE, skipLocked: true } : {}),
            });

            if (!events.length) {
                await tx.commit();
                await this.refreshQueueGauges();
                return;
            }

            for (const event of events) {
                try {
                    const payload = event.payload || {};
                    if (event.event_type === 'VOTE_SYNC_TO_BLOCKCHAIN') {
                        await fabricService.submitVote(payload);
                        if (payload.voteId) {
                            await VoteSagaStatus.update(
                                { current_state: 'BLOCKCHAIN_OK', last_error: null, state_updated_at: new Date() },
                                { where: { vote_id: payload.voteId }, transaction: tx }
                            );
                            await VoteSagaStatus.update(
                                { current_state: 'SQL_OK', last_error: null, state_updated_at: new Date() },
                                { where: { vote_id: payload.voteId }, transaction: tx }
                            );
                            await VoteSagaStatus.update(
                                { current_state: 'NOTIFIED', last_error: null, state_updated_at: new Date() },
                                { where: { vote_id: payload.voteId }, transaction: tx }
                            );
                        }
                    } else {
                        throw new Error(`Unsupported outbox event type: ${event.event_type}`);
                    }

                    event.status = 'PROCESSED';
                    event.processed_at = new Date();
                    event.last_error = null;
                    await event.save({ transaction: tx });
                    reconciliationProcessedTotal.labels('success').inc();
                } catch (error) {
                    const nextRetry = Number(event.retry_count || 0) + 1;
                    const maxRetries = Number(process.env.OUTBOX_MAX_RETRIES || 10);
                    const delayMs = Math.min(300000, 1000 * (2 ** Math.min(nextRetry, 8)));

                    event.retry_count = nextRetry;
                    event.last_error = error.message;

                    if (nextRetry >= maxRetries) {
                        event.status = 'FAILED';
                        await event.save({ transaction: tx });
                        if (event.payload?.voteId) {
                            await VoteSagaStatus.update(
                                { current_state: 'FAILED', last_error: error.message, state_updated_at: new Date() },
                                { where: { vote_id: event.payload.voteId }, transaction: tx }
                            );
                        }
                        await this.enqueueDeadLetter({
                            sourceEventId: event.event_id,
                            eventType: event.event_type,
                            payload: event.payload,
                            errorMessage: `Reconciliation retries exhausted: ${error.message}`,
                        });
                        reconciliationProcessedTotal.labels('deadletter').inc();
                    } else {
                        event.status = 'PENDING';
                        event.next_attempt_at = new Date(Date.now() + delayMs);
                        await event.save({ transaction: tx });
                        reconciliationProcessedTotal.labels('retry').inc();
                    }
                }
            }

            await tx.commit();
            await this.refreshQueueGauges();
        } catch (error) {
            await tx.rollback();
            logger.error('Outbox reconciliation batch failed', { error: error.message });
        }
    }

    async refreshQueueGauges() {
        try {
            const [pendingOutbox, pendingDeadLetter] = await Promise.all([
                OutboxEvent.count({ where: { status: 'PENDING' } }),
                DeadLetterEvent.count({ where: { resolved: false } }),
            ]);
            outboxPendingGauge.set(pendingOutbox);
            deadLetterPendingGauge.set(pendingDeadLetter);
        } catch (error) {
            logger.warn('Failed to refresh queue gauges', { error: error.message });
        }
    }

    start() {
        if (this.intervalHandle) return;
        const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS || 30_000);
        this.intervalHandle = setInterval(async () => {
            if (this.running) return;
            this.running = true;
            try {
                await this.processOutboxBatch();
            } finally {
                this.running = false;
            }
        }, intervalMs);
        logger.info('Reconciliation saga started', { intervalMs });
    }

    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            logger.info('Reconciliation saga stopped');
        }
    }
}

module.exports = new ReconciliationSagaService();
