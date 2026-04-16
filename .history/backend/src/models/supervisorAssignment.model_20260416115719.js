const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const SupervisorAssignment = sequelize.define('supervisor_assignments', {
    assignment_id: {
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
    supervisor_admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    assigned_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    assignment_start: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    assignment_end: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'ACTIVE',
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, withSchemaOption('supervisor_assignments', {
    timestamps: true,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['booth_id'] },
        { fields: ['supervisor_admin_id'] },
        { fields: ['status'] },
    ],
}));

module.exports = SupervisorAssignment;
