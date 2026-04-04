const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');

const VoterPasskey = sequelize.define('voter_passkeys', {
    id: {
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
    credential_id: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
    },
    public_key: {
        type: DataTypes.BLOB,
        allowNull: false,
    },
    counter: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
    },
    transports: {
        type: DataTypes.STRING(255), // JSON string of transports
        allowNull: true,
    },
    device_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    last_used: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    timestamps: true,
    tableName: 'voter_passkeys',
});

module.exports = VoterPasskey;
