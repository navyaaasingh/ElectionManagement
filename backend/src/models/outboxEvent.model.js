const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const OutboxEvent = sequelize.define('outbox_events', {
    event_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    aggregate_type: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    aggregate_id: {
        type: DataTypes.STRING(128),
        allowNull: false,
    },
    event_type: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    payload: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'PENDING',
    },
    retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    last_error: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    next_attempt_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    processed_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, withSchemaOption('outbox_events', {
    timestamps: true,
    indexes: [
        { fields: ['status', 'next_attempt_at'] },
        { fields: ['aggregate_type', 'aggregate_id'] },
        { fields: ['event_type', 'status'] },
    ],
}));

module.exports = OutboxEvent;
