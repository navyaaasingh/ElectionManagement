const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const CustodyEvent = sequelize.define('custody_events', {
    custody_event_id: {
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
        allowNull: true,
        references: {
            model: 'polling_booths',
            key: 'booth_id',
        },
    },
    terminal_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    actor_admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
    event_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
    },
    event_hash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
    },
    prev_event_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
    },
    payload: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, withSchemaOption('custody_events', {
    timestamps: false,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['booth_id'] },
        { fields: ['terminal_id'] },
        { fields: ['actor_admin_id'] },
        { fields: ['created_at'] },
    ],
}));

module.exports = CustodyEvent;
