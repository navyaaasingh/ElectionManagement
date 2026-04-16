const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const ManualOverrideRequest = sequelize.define('manual_override_requests', {
    override_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    election_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'elections',
            key: 'election_id',
        },
    },
    booth_session_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'booth_sessions',
            key: 'session_id',
        },
    },
    voter_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'voters',
            key: 'voter_id',
        },
    },
    requested_by_admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    approved_by_admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    reason_code: {
        type: DataTypes.STRING(80),
        allowNull: false,
    },
    details: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'PENDING_APPROVAL',
    },
    requested_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    resolved_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    resolution_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
    },
}, withSchemaOption('manual_override_requests', {
    timestamps: false,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['booth_session_id'] },
        { fields: ['voter_id'] },
        { fields: ['status'] },
    ],
}));

module.exports = ManualOverrideRequest;
