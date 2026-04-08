const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');

const AdminUser = sequelize.define('admin_users', {
    admin_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    username: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true,
        },
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM('SUPER_ADMIN', 'ELECTION_OFFICER', 'TECHNICAL_ADMIN', 'OBSERVER'),
        allowNull: false,
        defaultValue: 'ELECTION_OFFICER',
    },
    district_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'districts',
            key: 'district_id',
        },
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    last_login: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    timestamps: true,
    tableName: 'admin_users',
});

module.exports = AdminUser;
