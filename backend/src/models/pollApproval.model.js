const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');

const PollApproval = sequelize.define('poll_approvals', {
    approval_id: {
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
    requested_status: {
        type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'CANCELLED'),
        allowNull: false,
    },
    requested_by_admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    approver_admin_ids: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
    },
    required_approvals: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING',
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'poll_approvals',
    timestamps: true,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['status'] },
    ],
});

module.exports = PollApproval;
