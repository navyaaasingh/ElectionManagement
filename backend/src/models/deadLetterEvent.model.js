const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const DeadLetterEvent = sequelize.define('dead_letter_events', {
    dead_letter_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    source_event_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    source_table: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'outbox_events',
    },
    event_type: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    payload: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    failure_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    resolved: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    resolved_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, withSchemaOption('dead_letter_events', {
    timestamps: true,
    indexes: [
        { fields: ['resolved', 'created_at'] },
        { fields: ['event_type', 'resolved'] },
    ],
}));

module.exports = DeadLetterEvent;
