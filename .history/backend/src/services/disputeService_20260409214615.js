"""
Dispute Resolution Service
Handles election disputes, recounts, and evidence collection

API for:
    - Filing disputes
        - Collecting blockchain evidence
            - Triggering recounts
                - Generating resolution reports
"""

const fabricService = require('./fabricService.js');
const Dispute = require('../models/Dispute.js');
const { Election } = require('../models/index.js');
const logger = require('../utils/logger.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');


class DisputeResolutionService {
    getAllowedTransitions() {
        return {
            PENDING: ['CHALLENGED', 'REJECTED'],
            CHALLENGED: ['UNDER_REVIEW', 'REJECTED'],
            UNDER_REVIEW: ['ADJUDICATION_PENDING', 'REJECTED'],
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

    async updateChallenge(dispute_id, payload) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        this.assertTransition(dispute.status, 'CHALLENGED');

        dispute.challenge = {
            submitted_at: new Date(),
            ...payload,
        };
        dispute.status = 'CHALLENGED';
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

        const nextStatus = payload.outcome === 'accept'
            ? 'ADJUDICATION_PENDING'
            : payload.outcome === 'needs_evidence'
                ? 'UNDER_REVIEW'
                : 'REJECTED';

        this.assertTransition(dispute.status, nextStatus);

        dispute.review = {
            reviewed_at: new Date(),
            ...payload,
        };
        dispute.status = nextStatus;
        dispute.events.push({
            event_type: 'REVIEW_COMPLETED',
            timestamp: new Date(),
            details: payload,
        });
        await dispute.save();
        return dispute;
    }

    async adjudicate(dispute_id, payload) {
        const dispute = await Dispute.findOne({ dispute_id });
        if (!dispute) throw new Error('Dispute not found');

        const nextStatus = payload.decision === 'dismissed' ? 'REJECTED' : 'APPROVED';
        this.assertTransition(dispute.status, nextStatus);

        dispute.adjudication = {
            adjudicated_at: new Date(),
            ...payload,
        };
        dispute.status = nextStatus;
        dispute.events.push({
            event_type: 'ADJUDICATED',
            timestamp: new Date(),
            details: payload,
        });
        await dispute.save();
        return dispute;
    }

    /**
     * File a new dispute
     */
    async fileDispute(data) {
        const {
            election_id,
            district_id,
            filed_by,
            reason,
            evidence_description,
            evidence_files,
            challenge
        } = data;

        logger.info(`Filing dispute for election: ${election_id}`);

        // Create dispute record
        const dispute = await Dispute.create({
            dispute_id: this.generateDisputeId(),
            election_id,
            district_id,
            filed_by,
            reason,
            evidence_description,
            evidence_files,
            challenge: challenge || null,
            status: 'PENDING',
            filed_at: new Date(),
            events: [{
                event_type: 'FILED',
                timestamp: new Date(),
                details: { filed_by, reason }
            }]
        });

        logger.info(`Dispute filed: ${dispute.dispute_id}`);

        return dispute;
    }

    /**
     * Update dispute status
     */
    async updateDisputeStatus(dispute_id, status, notes, updated_by) {
        const dispute = await Dispute.findOne({ dispute_id });

        if (!dispute) {
            throw new Error('Dispute not found');
        }

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
                notes
            }
        });

        await dispute.save();

        logger.info(`Dispute ${dispute_id} status updated: ${status}`);

        return dispute;
    }

    /**
     * Collect blockchain evidence for dispute
     */
    async collectBlockchainEvidence(dispute_id) {
        const dispute = await Dispute.findOne({ dispute_id });

        if (!dispute) {
            throw new Error('Dispute not found');
        }

        logger.info(`Collecting blockchain evidence for dispute: ${dispute_id}`);

        // Query blockchain for all votes in district
        const votes = await fabricService.getVotesByElection(dispute.election_id);
        const districtVotes = Array.isArray(votes)
            ? votes.filter((vote) => String(vote.districtId || vote.district || '') === String(dispute.district_id))
            : [];

        // Analyze vote patterns
        const analysis = this.analyzeVotePatterns(districtVotes);

        // Get transaction timestamps
        const timestamps = districtVotes.map(v => ({
            vote_id: v.voteId,
            timestamp: v.timestamp,
            block_number: v.blockNumber
        }));

        // Detect anomalies
        const anomalies = this.detectAnomalies(districtVotes);

        const evidence = {
            dispute_id,
            collected_at: new Date(),
            total_votes: districtVotes.length,
            vote_timestamps: timestamps,
            vote_analysis: analysis,
            anomalies,
            blockchain_state_hash: 'fabric-state-hash-unavailable'
        };

        // Save evidence to dispute
        dispute.blockchain_evidence = evidence;
        dispute.events.push({
            event_type: 'EVIDENCE_COLLECTED',
            timestamp: new Date(),
            details: { votes_analyzed: districtVotes.length }
        });

        await dispute.save();

        logger.info(`Evidence collected: ${districtVotes.length} votes analyzed`);

        return evidence;
    }

    /**
     * Trigger recount for disputed election
     */
    async triggerRecount(dispute_id, requested_by) {
        const dispute = await Dispute.findOne({ dispute_id });

        if (!dispute) {
            throw new Error('Dispute not found');
        }

        if (dispute.status !== 'APPROVED') {
            throw new Error('Dispute must be approved before recount');
        }

        logger.info(`Triggering recount for dispute: ${dispute_id}`);

        // Lock election results
        await this.lockElectionResults(dispute.election_id);

        // Query all votes from blockchain
        const votes = await fabricService.getVotesByElection(dispute.election_id);
        const districtVotes = Array.isArray(votes)
            ? votes.filter((vote) => String(vote.districtId || vote.district || '') === String(dispute.district_id))
            : [];

        // Re-tally votes (would need decryption key ceremony)
        logger.info(`Re-tallying ${districtVotes.length} votes...`);

        // For demo: simulate recount (in production, decrypt and tally)
        const recountResults = await this.performRecount(districtVotes);

        // Get original results
        const originalResults = await this.getOriginalResults(
            dispute.election_id,
            dispute.district_id
        );

        // Compare results
        const discrepancies = this.compareResults(originalResults, recountResults);

        // Log recount to blockchain
        // Update dispute with recount results
        dispute.recount_results = {
            original: originalResults,
            recount: recountResults,
            discrepancies,
            recounted_at: new Date(),
            recounted_by: requested_by
        };

        dispute.status = 'RECOUNT_COMPLETE';
        dispute.events.push({
            event_type: 'RECOUNT_COMPLETED',
            timestamp: new Date(),
            details: {
                votes_recounted: districtVotes.length,
                discrepancies_found: discrepancies.length
            }
        });

        await dispute.save();

        logger.info(`Recount complete: ${discrepancies.length} discrepancies found`);

        return {
            original: originalResults,
            recount: recountResults,
            discrepancies
        };
    }

    /**
     * Generate dispute resolution report (PDF)
     */
    async generateResolutionReport(dispute_id, output_path) {
        const dispute = await Dispute.findOne({ dispute_id })
            .populate('election_id')
            .populate('filed_by');

        if (!dispute) {
            throw new Error('Dispute not found');
        }

        logger.info(`Generating resolution report for: ${dispute_id}`);

        // Create PDF
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(output_path);
        doc.pipe(stream);

        // Header
        doc.fontSize(20).text('ELECTION DISPUTE RESOLUTION REPORT', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text('═'.repeat(70), { align: 'center' });
        doc.moveDown(2);

        // Dispute Information
        doc.fontSize(14).text('Dispute Information', { underline: true });
        doc.moveDown();
        doc.fontSize(10);
        doc.text(`Dispute ID: ${dispute.dispute_id}`);
        doc.text(`Election: ${dispute.election_id.election_name}`);
        doc.text(`District: ${dispute.district_id}`);
        doc.text(`Filed By: ${dispute.filed_by.name}`);
        doc.text(`Filed At: ${dispute.filed_at.toISOString()}`);
        doc.text(`Status: ${dispute.status}`);
        doc.text(`Reason: ${dispute.reason}`);
        doc.moveDown(2);

        // Evidence Summary
        if (dispute.blockchain_evidence) {
            doc.fontSize(14).text('Blockchain Evidence', { underline: true });
            doc.moveDown();
            doc.fontSize(10);
            doc.text(`Total Votes Analyzed: ${dispute.blockchain_evidence.total_votes}`);
            doc.text(`Anomalies Detected: ${dispute.blockchain_evidence.anomalies.length}`);
            doc.moveDown();

            if (dispute.blockchain_evidence.anomalies.length > 0) {
                doc.text('Anomalies:', { underline: true });
                dispute.blockchain_evidence.anomalies.forEach((anomaly, idx) => {
                    doc.text(`  ${idx + 1}. ${anomaly.type}: ${anomaly.description}`);
                });
            }
            doc.moveDown(2);
        }

        // Recount Results
        if (dispute.recount_results) {
            doc.fontSize(14).text('Recount Results', { underline: true });
            doc.moveDown();
            doc.fontSize(10);

            doc.text('Original Results:');
            Object.entries(dispute.recount_results.original).forEach(([candidate, votes]) => {
                doc.text(`  ${candidate}: ${votes} votes`);
            });
            doc.moveDown();

            doc.text('Recount Results:');
            Object.entries(dispute.recount_results.recount).forEach(([candidate, votes]) => {
                doc.text(`  ${candidate}: ${votes} votes`);
            });
            doc.moveDown();

            if (dispute.recount_results.discrepancies.length > 0) {
                doc.text('Discrepancies Found:', { underline: true });
                dispute.recount_results.discrepancies.forEach((disc, idx) => {
                    doc.text(`  ${idx + 1}. ${disc.description}`);
                });
            } else {
                doc.text('No discrepancies found - results match.');
            }
            doc.moveDown(2);
        }

        // Timeline
        doc.fontSize(14).text('Event Timeline', { underline: true });
        doc.moveDown();
        doc.fontSize(10);
        dispute.events.forEach((event, idx) => {
            doc.text(`${idx + 1}. ${event.event_type} - ${event.timestamp.toISOString()}`);
            if (event.details) {
                doc.text(`   ${JSON.stringify(event.details)}`);
            }
        });
        doc.moveDown(2);

        // Footer
        doc.fontSize(8).text('─'.repeat(80), { align: 'center' });
        doc.text(`Report Generated: ${new Date().toISOString()}`, { align: 'center' });
        doc.text('Election Commission - Dispute Resolution System', { align: 'center' });

        // Finalize PDF
        doc.end();

        await new Promise((resolve) => stream.on('finish', resolve));

        logger.info(`Resolution report generated: ${output_path}`);

        return output_path;
    }

    // Helper methods

    generateDisputeId() {
        return `DISP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }

    async lockElectionResults(election_id) {
        await Election.updateOne(
            { election_id },
            { results_locked: true, locked_at: new Date() }
        );
        logger.info(`Election results locked: ${election_id}`);
    }

    analyzeVotePatterns(votes) {
        // Analyze temporal distribution
        const hourlyDistribution = {};
        votes.forEach(vote => {
            const hour = new Date(vote.timestamp).getHours();
            hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
        });

        return {
            total_votes: votes.length,
            hourly_distribution: hourlyDistribution,
            time_range: {
                first_vote: Math.min(...votes.map(v => v.timestamp)),
                last_vote: Math.max(...votes.map(v => v.timestamp))
            }
        };
    }

    detectAnomalies(votes) {
        const anomalies = [];

        // Check for duplicate vote timestamps (suspicious)
        const timestampCounts = {};
        votes.forEach(vote => {
            timestampCounts[vote.timestamp] = (timestampCounts[vote.timestamp] || 0) + 1;
        });

        Object.entries(timestampCounts).forEach(([timestamp, count]) => {
            if (count > 1) {
                anomalies.push({
                    type: 'DUPLICATE_TIMESTAMPS',
                    description: `${count} votes at same timestamp: ${timestamp}`,
                    severity: 'MEDIUM'
                });
            }
        });

        // TODO: Add more anomaly detection logic

        return anomalies;
    }

    async performRecount(votes) {
        // In production: decrypt votes and re-tally
        // For demo: return simulated counts
        return {
            'Candidate A': Math.floor(votes.length * 0.45),
            'Candidate B': Math.floor(votes.length * 0.35),
            'Candidate C': Math.floor(votes.length * 0.20)
        };
    }

    async getOriginalResults(election_id, district_id) {
        // Fetch original results from database
        const election = await Election.findOne({ election_id });
        return election.results[district_id] || {};
    }

    compareResults(original, recount) {
        const discrepancies = [];

        const allCandidates = new Set([
            ...Object.keys(original),
            ...Object.keys(recount)
        ]);

        allCandidates.forEach(candidate => {
            const originalVotes = original[candidate] || 0;
            const recountVotes = recount[candidate] || 0;
            const diff = recountVotes - originalVotes;

            if (diff !== 0) {
                discrepancies.push({
                    candidate,
                    original: originalVotes,
                    recount: recountVotes,
                    difference: diff,
                    description: `${candidate}: ${diff > 0 ? '+' : ''}${diff} votes`
                });
            }
        });

        return discrepancies;
    }
}


module.exports = new DisputeResolutionService();
