const { DataTypes  } = require('sequelize');
const { sequelize  } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const VotingRecord = sequelize.define('voting_records', {
    record_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    voter_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'voters',
            key: 'voter_id',
        },
    },
    election_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'elections',
            key: 'election_id',
        },
    },
    candidate_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'candidates',
            key: 'candidate_id',
        },
    },
    terminal_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'iot_terminals',
            key: 'terminal_id',
        },
    },
    vote_timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
    },
    blockchain_tx_id: {
        type: DataTypes.STRING(255),
        comment: 'Transaction ID on Hyperledger Fabric',
    },
    verification_hash: {
        type: DataTypes.STRING(64),
        comment: 'SHA-256 hash of biometric + timestamp for verification',
    },
    biometric_hash_salted: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'SHA-256(biometricHash:voterId:electionId:terminalId) to reduce collision/replay risk',
    },
    request_nonce: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: 'Client nonce for replay protection',
    },
    ranking_payload: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Ranked candidate preferences for elimination runoff',
    },
}, withSchemaOption('voting_records', {
    indexes: [
        { unique: true, fields: ['voter_id', 'election_id'] },
        { fields: ['voter_id', 'election_id'] },
        { fields: ['election_id'] },
        { fields: ['candidate_id'] },
        { fields: ['vote_timestamp'] },
        { fields: ['blockchain_tx_id'] },
        { fields: ['verification_hash'] },
        { fields: ['request_nonce'] },
        { fields: ['election_id', 'vote_timestamp'] },
    ],
    timestamps: true,
}));

module.exports = VotingRecord;
