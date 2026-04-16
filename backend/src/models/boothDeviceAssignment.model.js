const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const BoothDeviceAssignment = sequelize.define('booth_device_assignments', {
    booth_device_assignment_id: {
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
    booth_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'polling_booths',
            key: 'booth_id',
        },
    },
    terminal_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    assigned_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    assigned_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    released_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'ASSIGNED',
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
    },
}, withSchemaOption('booth_device_assignments', {
    timestamps: false,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['booth_id'] },
        { fields: ['terminal_id'] },
        { fields: ['status'] },
    ],
}));

module.exports = BoothDeviceAssignment;
