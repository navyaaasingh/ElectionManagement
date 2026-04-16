const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const BallotToken = sequelize.define('ballot_tokens', {
    token_id: {
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
        allowNull: false,
        references: {
            model: 'voters',
            key: 'voter_id',
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
    terminal_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    issued_by_admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    token_hash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
    },
    issued_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    consumed_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'ISSUED',
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
}, withSchemaOption('ballot_tokens', {
    timestamps: false,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['voter_id'] },
        { fields: ['booth_session_id'] },
        { fields: ['status'] },
        { fields: ['expires_at'] },
    ],
}));

module.exports = BallotToken;
