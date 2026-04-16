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
            isIn: [[
                'DRAFT',
                'REGISTRATION_OPEN',
                'REGISTRATION_CLOSED',
                'ELIGIBILITY_FROZEN',
                'READY_FOR_POLLING',
                'ACTIVE_POLLING',
                'PAUSED',
                'POLLING_CLOSED',
                'TALLYING',
                'AUDITING',
                'CERTIFIED',
                'ARCHIVED',
                'PENDING',
                'ACTIVE',
                'COMPLETED',
                'CANCELLED',
            ]]
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
    eligibility_rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Dynamic voter eligibility rule set (age/party/location/custom)',
    },
    runoff_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Multi-round elimination settings for runoff elections',
    },
}, withSchemaOption('elections', {
    indexes: [
        { fields: ['start_date', 'end_date'] },
        { fields: ['status'] },
    ],
    timestamps: true,
}));

module.exports = Election;
