/**
 * Dispute Model (MongoDB)
 */

const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
    dispute_id: {
        type: String,
        required: true,
        unique: true
    },
    election_id: {
        type: String,
        required: true,
        ref: 'Election'
    },
    district_id: {
        type: String,
        required: true
    },
    filed_by: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    evidence_description: String,
    evidence_files: [String],
    status: {
        type: String,
        enum: ['PENDING', 'CHALLENGED', 'UNDER_REVIEW', 'ADJUDICATION_PENDING', 'APPROVED', 'REJECTED', 'RECOUNT_IN_PROGRESS', 'RECOUNT_COMPLETE', 'RESOLVED'],
        default: 'PENDING'
    },
    challenge: {
        type: Object,
        default: null,
    },
    review: {
        type: Object,
        default: null,
    },
    adjudication: {
        type: Object,
        default: null,
    },
    filed_at: {
        type: Date,
        default: Date.now
    },
    blockchain_evidence: {
        type: Object,
        default: null
    },
    recount_results: {
        type: Object,
        default: null
    },
    resolution: {
        type: String,
        default: null
    },
    resolved_at: Date,
    events: [{
        event_type: String,
        timestamp: Date,
        details: Object
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Dispute', disputeSchema);
