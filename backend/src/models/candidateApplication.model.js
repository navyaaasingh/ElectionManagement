const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const CandidateApplication = sequelize.define('candidate_applications', {
    application_id: {
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
    applicant_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    student_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    phone: {
        type: DataTypes.STRING(32),
        allowNull: true,
    },
    department: {
        type: DataTypes.STRING(128),
        allowNull: true,
    },
    year: {
        type: DataTypes.STRING(32),
        allowNull: true,
    },
    cgpa: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true,
    },
    manifesto: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    requested_party_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    requested_party_symbol: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    requested_district_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING',
    },
    reviewed_by_admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    review_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, withSchemaOption('candidate_applications', {
    timestamps: true,
    indexes: [
        { fields: ['election_id', 'status'] },
        { fields: ['student_id', 'election_id'] },
        { fields: ['email'] },
    ],
}));

module.exports = CandidateApplication;
