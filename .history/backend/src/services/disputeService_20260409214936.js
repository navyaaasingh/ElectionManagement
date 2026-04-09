/**
 * Dispute Resolution Service
 * Challenge -> Review -> Adjudicate workflow with optional recount.
 */

const fabricService = require('./fabricService.js');
const Dispute = require('../models/Dispute.js');
const { Election } = require('../models/index.js');
const logger = require('../utils/logger.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');

class DisputeResolutionService {
    getAllowedTransitions() {
        return {
            PENDING: ['CHALLENGED', 'UNDER_REVIEW', 'REJECTED'],
            CHALLENGED: ['UNDER_REVIEW', 'ADJUDICATION_PENDING', 'REJECTED'],
            UNDER_REVIEW: ['CHALLENGED', 'ADJUDICATION_PENDING', 'REJECTED'],
            ADJUDICATION_PENDING: ['APPROVED', 'REJECTED', 'RESOLVED'],
            APPROVED: ['RECOUNT_IN_PROGRESS', 'RESOLVED'],
            RECOUNT_IN_PROGRESS: ['RECOUNT_COMPLETE', 'RESOLVED'],
            RECOUNT_COMPLETE: ['RESOLVED'],
            REJECTED: [],
            RESOLVED: [],
        };
    }

    assertTransition(fromStatus, toStatus) {
        const allowed = this.getAllowedTransitions()[fromStatus] || [];
        if (!allowed.includes(toStatus)) {
            throw new Error(`Invalid dispute transition from ${fromStatus} to ${toStatus}`);
        }
    }

    async fileDispute(data) {
        const {
            election_id,
            district_id,
            filed_by,
            reason,
            evidence_description,
            evidence_files,
            challenge,
        } = data;

        logger.info(`Filing dispute for election: ${election_id}`);

        const dispute = await Dispute.create({
            dispute_id: this.generateDisputeId(),
            election_id,
            district_id,
            filed_by,
            reason,
            evidence_description,
            evidence_files: Array.isArray(evidence_files) ? evidence_files : [],
            challenge: challenge || null,
            status: challenge ? 'CHALLENGED' : 'PENDING',
            filed_at: new Date(),
            events: [
                {
                    event_type: 'FILED',
                    timestamp: new Date(),
                    details: { filed_by, reason },
                },
                ...(challenge
                    ? [{ event_type: 'CHALLENGE_SUBMITTED', timestamp: new Date(), details: challenge }]
                    : []),
            ],
        });

        return dispute;
    }

    async updateChallenge(dispute_id, payload) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        const target = dispute.status === 'UNDER_REVIEW' ? 'CHALLENGED' : 'CHALLENGED';
        this.assertTransition(dispute.status, target);

        dispute.challenge = {
            submitted_at: new Date(),
            ...payload,
        };
        dispute.status = target;
        dispute.events.push({
            event_type: 'CHALLENGE_SUBMITTED',
            timestamp: new Date(),
            details: payload,
        });

        await dispute.save();
        return dispute;
    }

    async updateReview(dispute_id, payload) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        const outcome = String(payload.outcome || '').toLowerCase();
        const nextStatus = outcome === 'accept'
            ? 'ADJUDICATION_PENDING'
            : outcome === 'needs_evidence'
                ? 'UNDER_REVIEW'
                : 'REJECTED';

        this.assertTransition(dispute.status, nextStatus);

        dispute.review = {
            reviewed_at: new Date(),
            ...payload,
            outcome,
        };
        dispute.status = nextStatus;
        dispute.events.push({
            event_type: 'REVIEW_COMPLETED',
            timestamp: new Date(),
            details: dispute.review,
        });

        await dispute.save();
        return dispute;
    }

    async adjudicate(dispute_id, payload) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        const decision = String(payload.decision || '').toLowerCase();
        const nextStatus = decision === 'dismissed' ? 'REJECTED' : 'APPROVED';

        this.assertTransition(dispute.status, nextStatus);

        dispute.adjudication = {
            adjudicated_at: new Date(),
            ...payload,
            decision,
        };
        dispute.status = nextStatus;
        dispute.events.push({
            event_type: 'ADJUDICATED',
            timestamp: new Date(),
            details: dispute.adjudication,
        });

        await dispute.save();
        return dispute;
    }

    async updateDisputeStatus(dispute_id, status, notes, updated_by) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        const currentStatus = dispute.status;
        this.assertTransition(currentStatus, status);

        dispute.status = status;
        dispute.events.push({
            event_type: 'STATUS_UPDATED',
            timestamp: new Date(),
            details: {
                from_status: currentStatus,
                to_status: status,
                updated_by,
                notes,
            },
        });

        await dispute.save();
        return dispute;
    }

    async collectBlockchainEvidence(dispute_id) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        const votes = await fabricService.getVotesByElection(dispute.election_id);
        const districtVotes = Array.isArray(votes)
            ? votes.filter((vote) => String(vote.districtId || vote.district || '') === String(dispute.district_id))
            : [];

        const evidence = {
            dispute_id,
            collected_at: new Date(),
            total_votes: districtVotes.length,
            vote_timestamps: districtVotes.map((v) => ({
                vote_id: v.voteId || v.vote_id || null,
                timestamp: v.timestamp || null,
                block_number: v.blockNumber || null,
            })),
            vote_analysis: this.analyzeVotePatterns(districtVotes),
            anomalies: this.detectAnomalies(districtVotes),
            blockchain_state_hash: 'fabric-state-hash-unavailable',
        };

        dispute.blockchain_evidence = evidence;
        dispute.events.push({
            event_type: 'EVIDENCE_COLLECTED',
            timestamp: new Date(),
            details: { votes_analyzed: districtVotes.length },
        });
        await dispute.save();

        return evidence;
    }

    async triggerRecount(dispute_id, requested_by) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');
        if (dispute.status !== 'APPROVED') {
            throw new Error('Dispute must be approved before recount');
        }

        this.assertTransition(dispute.status, 'RECOUNT_IN_PROGRESS');
        dispute.status = 'RECOUNT_IN_PROGRESS';
        dispute.events.push({
            event_type: 'RECOUNT_STARTED',
            timestamp: new Date(),
            details: { requested_by },
        });
        await dispute.save();

        const votes = await fabricService.getVotesByElection(dispute.election_id);
        const districtVotes = Array.isArray(votes)
            ? votes.filter((vote) => String(vote.districtId || vote.district || '') === String(dispute.district_id))
            : [];

        const recountResults = await this.performRecount(districtVotes);
        const originalResults = await this.getOriginalResults(dispute.election_id, dispute.district_id);
        const discrepancies = this.compareResults(originalResults, recountResults);

        this.assertTransition(dispute.status, 'RECOUNT_COMPLETE');
        dispute.recount_results = {
            original: originalResults,
            recount: recountResults,
            discrepancies,
            recounted_at: new Date(),
            recounted_by: requested_by,
        };
        dispute.status = 'RECOUNT_COMPLETE';
        dispute.events.push({
            event_type: 'RECOUNT_COMPLETED',
            timestamp: new Date(),
            details: {
                votes_recounted: districtVotes.length,
                discrepancies_found: discrepancies.length,
            },
        });
        await dispute.save();

        return {
            original: originalResults,
            recount: recountResults,
            discrepancies,
        };
    }

    async generateResolutionReport(dispute_id, output_path) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        const doc = new PDFDocument();
        const stream = fs.createWriteStream(output_path);
        doc.pipe(stream);

        doc.fontSize(20).text('ELECTION DISPUTE RESOLUTION REPORT', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Dispute ID: ${dispute.dispute_id}`);
        doc.text(`Election: ${dispute.election_id}`);
        doc.text(`District: ${dispute.district_id}`);
        doc.text(`Status: ${dispute.status}`);
        doc.text(`Filed By: ${dispute.filed_by}`);
        doc.text(`Filed At: ${new Date(dispute.filed_at).toISOString()}`);
        doc.moveDown();

        if (dispute.challenge) {
            doc.fontSize(12).text('Challenge', { underline: true });
            doc.fontSize(10).text(JSON.stringify(dispute.challenge));
            doc.moveDown();
        }

        if (dispute.review) {
            doc.fontSize(12).text('Review', { underline: true });
            doc.fontSize(10).text(JSON.stringify(dispute.review));
            doc.moveDown();
        }

        if (dispute.adjudication) {
            doc.fontSize(12).text('Adjudication', { underline: true });
            doc.fontSize(10).text(JSON.stringify(dispute.adjudication));
            doc.moveDown();
        }

        if (dispute.recount_results) {
            doc.fontSize(12).text('Recount Results', { underline: true });
            doc.fontSize(10).text(JSON.stringify(dispute.recount_results));
            doc.moveDown();
        }

        doc.fontSize(12).text('Timeline', { underline: true });
        doc.fontSize(10);
        dispute.events.forEach((event, idx) => {
            doc.text(`${idx + 1}. ${event.event_type} @ ${new Date(event.timestamp).toISOString()}`);
        });

        doc.end();
        await new Promise((resolve) => stream.on('finish', resolve));
        return output_path;
    }

    generateDisputeId() {
        return `DISP-${Date.now()}-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
    }

    analyzeVotePatterns(votes) {
        if (!votes.length) {
            return {
                total_votes: 0,
                hourly_distribution: {},
                time_range: { first_vote: null, last_vote: null },
            };
        }

        const hourlyDistribution = {};
        const timestamps = [];

        votes.forEach((vote) => {
            const time = new Date(vote.timestamp || Date.now());
            const hour = time.getHours();
            hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
            timestamps.push(time.getTime());
        });

        return {
            total_votes: votes.length,
            hourly_distribution: hourlyDistribution,
            time_range: {
                first_vote: new Date(Math.min(...timestamps)).toISOString(),
                last_vote: new Date(Math.max(...timestamps)).toISOString(),
            },
        };
    }

    detectAnomalies(votes) {
        const anomalies = [];
        const timestampCounts = {};

        votes.forEach((vote) => {
            const key = String(vote.timestamp || '');
            timestampCounts[key] = (timestampCounts[key] || 0) + 1;
        });

        Object.entries(timestampCounts).forEach(([timestamp, count]) => {
            if (timestamp && count > 1) {
                anomalies.push({
                    type: 'DUPLICATE_TIMESTAMPS',
                    description: `${count} votes at same timestamp: ${timestamp}`,
                    severity: 'MEDIUM',
                });
            }
        });

        return anomalies;
    }

    async performRecount(votes) {
        const tally = {};
        for (const vote of votes) {
            const candidateId = String(vote.candidateId || vote.candidate_id || 'UNKNOWN');
            tally[candidateId] = (tally[candidateId] || 0) + 1;
        }
        return tally;
    }

    async getOriginalResults(election_id, district_id) {
        try {
            const byDistrict = await fabricService.getResultsByDistrict(election_id, district_id);
            if (Array.isArray(byDistrict) && byDistrict.length > 0) {
                return byDistrict.reduce((acc, row) => {
                    const candidateId = String(row.candidateId || row.candidate_id || 'UNKNOWN');
                    acc[candidateId] = Number(row.voteCount || row.votes || 0);
                    return acc;
                }, {});
            }
        } catch (error) {
            logger.warn('District results unavailable for dispute comparison', { election_id, district_id, error: error.message });
        }

        try {
            const election = await Election.findByPk(election_id);
            if (election?.results && typeof election.results === 'object') {
                return election.results[district_id] || {};
            }
        } catch (error) {
            logger.warn('Election DB results unavailable for dispute comparison', { election_id, error: error.message });
        }

        return {};
    }

    compareResults(original, recount) {
        const discrepancies = [];
        const allCandidates = new Set([...Object.keys(original || {}), ...Object.keys(recount || {})]);

        allCandidates.forEach((candidate) => {
            const originalVotes = Number(original?.[candidate] || 0);
            const recountVotes = Number(recount?.[candidate] || 0);
            const diff = recountVotes - originalVotes;

            if (diff !== 0) {
                discrepancies.push({
                    candidate,
                    original: originalVotes,
                    recount: recountVotes,
                    difference: diff,
                    description: `${candidate}: ${diff > 0 ? '+' : ''}${diff} votes`,
                });
            }
        });

        return discrepancies;
    }
}

module.exports = new DisputeResolutionService();
