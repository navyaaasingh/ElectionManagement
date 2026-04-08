const { DataTypes  } = require('sequelize');
const { sequelize  } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const Election = sequelize.define('elections', {
    election_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
    },
    election_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
            isIn: [['NATIONAL', 'STATE', 'LOCAL', 'INSTITUTIONAL']]
        }
    },
    start_date: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    end_date: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(50),
        defaultValue: 'PENDING',
        validate: {
            isIn: [['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED']]
        }
    },
    created_by_admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
}, withSchemaOption('elections', {
    indexes: [
        { fields: ['start_date', 'end_date'] },
        { fields: ['status'] },
    ],
    timestamps: true,
}));

module.exports = Election;
