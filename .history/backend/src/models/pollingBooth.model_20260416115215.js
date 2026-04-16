const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const PollingBooth = sequelize.define('polling_booths', {
    booth_id: {
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
    district_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'districts',
            key: 'district_id',
        },
    },
    booth_code: {
        type: DataTypes.STRING(80),
        allowNull: false,
    },
    venue_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    room_label: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'PLANNED',
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
}, withSchemaOption('polling_booths', {
    timestamps: true,
    indexes: [
        { fields: ['election_id'] },
        { fields: ['district_id'] },
        { fields: ['status'] },
        { unique: true, fields: ['election_id', 'booth_code'] },
    ],
}));

module.exports = PollingBooth;
