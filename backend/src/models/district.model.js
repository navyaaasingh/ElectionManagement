const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');

const District = sequelize.define('districts', {
    district_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    state: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    country: {
        type: DataTypes.STRING(100),
        defaultValue: 'India',
        allowNull: false,
    },
    population: {
        type: DataTypes.INTEGER,
    },
}, {
    timestamps: true,
    tableName: 'districts',
});

module.exports = District;
