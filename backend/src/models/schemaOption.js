const { sequelize } = require('../db/index.js');
const { getSchemaForTable } = require('../contexts/context.config.js');

const withSchemaOption = (tableName, options = {}) => {
    const dialect = sequelize.getDialect();
    const schema = getSchemaForTable(tableName);
    if (dialect === 'postgres' && schema) {
        return { ...options, tableName, schema };
    }
    return { ...options, tableName };
};

module.exports = {
    withSchemaOption,
};
