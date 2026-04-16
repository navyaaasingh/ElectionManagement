const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const BoothSession = sequelize.define('booth_sessions', {
    session_id: {
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
        allowNull: true,
    },
    supervisor_admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    started_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    ended_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'ACTIVE',
    },
    start_reason_code: {
        type: DataTypes.STRING(80),
        allowNull: true,
    },
    stop_reason_code: {
        type: DataTypes.STRING(80),
        allowNull: true,
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
    },
}, withSchemaOption('booth_sessions', {
    timestamps: true,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['booth_id'] },
        { fields: ['terminal_id'] },
        { fields: ['supervisor_admin_id'] },
        { fields: ['status'] },
    ],
}));

module.exports = BoothSession;
