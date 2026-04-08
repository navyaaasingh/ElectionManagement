const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const VoteSagaStatus = sequelize.define('vote_saga_status', {
    saga_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    vote_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
    },
    voter_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    election_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    outbox_event_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    current_state: {
        type: DataTypes.ENUM('PENDING', 'BLOCKCHAIN_OK', 'SQL_OK', 'NOTIFIED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
    },
    last_error: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    state_updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, withSchemaOption('vote_saga_status', {
    timestamps: true,
    indexes: [
        { fields: ['current_state', 'state_updated_at'] },
        { fields: ['election_id', 'current_state'] },
        { fields: ['outbox_event_id'] },
    ],
}));

module.exports = VoteSagaStatus;
