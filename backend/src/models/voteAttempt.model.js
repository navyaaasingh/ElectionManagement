const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const VoteAttempt = sequelize.define('vote_attempts', {
    attempt_id: {
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
    voter_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'voters',
            key: 'voter_id',
        },
    },
    booth_session_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'booth_sessions',
            key: 'session_id',
        },
    },
    terminal_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    attempt_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    outcome: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    reason_code: {
        type: DataTypes.STRING(80),
        allowNull: true,
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
    },
    attempted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, withSchemaOption('vote_attempts', {
    timestamps: false,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['voter_id'] },
        { fields: ['booth_session_id'] },
        { fields: ['terminal_id'] },
        { fields: ['attempted_at'] },
    ],
}));

module.exports = VoteAttempt;
