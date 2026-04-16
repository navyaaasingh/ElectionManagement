const mongoose = require('mongoose');

// Audit Log Schema for MongoDB
const auditLogSchema = new mongoose.Schema({
    event_id: {
        type: String,
        required: true,
        unique: true,
        default: () => `LOG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    },
    event_type: {
        type: String,
        required: true,
    },
    user_id: {
        type: String,
        index: true,
    },
    admin_id: {
        type: String,
        index: true,
    },
    terminal_id: {
        type: String,
        index: true,
    },
    election_id: {
        type: String,
        index: true,
    },
    action: {
        type: String,
        required: true,
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
    },
    ip_address: {
        type: String,
    },
    user_agent: {
        type: String,
    },
    status: {
        type: String,
        enum: ['success', 'failure', 'pending'],
        default: 'success',
    },
    error_message: {
        type: String,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
}, {
    collection: 'audit_logs',
    timestamps: true,
});

// Indexes for efficient querying
auditLogSchema.index({ event_type: 1, timestamp: -1 });
auditLogSchema.index({ user_id: 1, timestamp: -1 });
auditLogSchema.index({ election_id: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

// TTL Index - Auto-delete logs older than 2 years
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
