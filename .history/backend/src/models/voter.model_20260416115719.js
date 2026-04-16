const { DataTypes  } = require('sequelize');
const { sequelize  } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

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
        allowNull: true, // Nullable for email/password registered voters (collected at kiosk later)
        unique: true,
        comment: 'SHA-256 hash of fingerprint template (optional if using WebAuthn or email signup)',
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
    registration_date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    status: {
        type: DataTypes.ENUM('pending', 'active', 'suspended', 'deceased'),
        defaultValue: 'pending',
    },
    device_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Unique ID of the device used for registration/voting',
    },
    admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    date_of_birth: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    party_affiliation: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    state: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    section: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    class_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    academic_year: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    location_meta: {
        type: DataTypes.JSON,
        allowNull: true,
    },
}, withSchemaOption('voters', {
    timestamps: true,
}));

module.exports = Voter;
