const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');

const VoteNonce = sequelize.define('vote_nonces', {
    nonce_id: {
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
    nonce: {
        type: DataTypes.STRING(128),
        allowNull: false,
    },
    used_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'vote_nonces',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['voter_id', 'election_id', 'nonce'] },
        { fields: ['election_id'] },
        { fields: ['used_at'] },
    ],
});

module.exports = VoteNonce;
