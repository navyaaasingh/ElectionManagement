const { DataTypes  } = require('sequelize');
const { sequelize  } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const Candidate = sequelize.define('candidates', {
    candidate_id: {
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
    full_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    party_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    party_symbol: {
        type: DataTypes.STRING(255),
        comment: 'URL or path to party symbol image',
    },
    district_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'districts',
            key: 'district_id',
        },
    },
    candidate_photo: {
        type: DataTypes.STRING(255),
        comment: 'URL or path to candidate photo',
    },
    position_title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'Candidate',
        comment: 'e.g., President, General Secretary',
    },
    biography: {
        type: DataTypes.TEXT,
        comment: 'Brief background of the candidate',
    },
    manifesto_summary: {
        type: DataTypes.TEXT,
        comment: 'Key promises/goals for the election',
    },
    votes_received: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    status: {
        type: DataTypes.ENUM('active', 'withdrawn', 'disqualified'),
        defaultValue: 'active',
    },
}, withSchemaOption('candidates', {
    indexes: [
        { fields: ['election_id'] },
        { fields: ['district_id'] },
        { fields: ['status'] },
    ],
    timestamps: true,
}));

module.exports = Candidate;
