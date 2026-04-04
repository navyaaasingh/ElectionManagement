const { DataTypes  } = require('sequelize');
const { sequelize  } = require('../db/index.js');

const Voter = sequelize.define('voters', {
    voter_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    roll_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        validate: {
            isEmail: true,
        },
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: true, // Only if choosing email/password login
    },
    aadhar_number: {
        type: DataTypes.STRING(12),
        allowNull: false,
        unique: true,
        validate: {
            len: [12, 12],
            isNumeric: true,
        },
    },
    full_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    biometric_hash: {
        type: DataTypes.STRING(64),
        allowNull: true, // Nullable initially for email signup
        unique: true,
        comment: 'SHA-256 hash of fingerprint template (optional if using WebAuthn)',
    },
    district_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'districts',
            key: 'district_id',
        },
    },
    has_voted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
    is_approved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    is_biometric_registered: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    aadhaar_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    device_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Unique ID of the device used for registration/voting',
    },
}, {
    indexes: [
        { fields: ['aadhar_number'] },
        { fields: ['email'] },
        { fields: ['biometric_hash'] },
        { fields: ['district_id'] },
        { fields: ['has_voted'] },
        { fields: ['status'] },
        { fields: ['device_id'] },
    ],
    timestamps: true,
    tableName: 'voters',
});

module.exports = Voter;
