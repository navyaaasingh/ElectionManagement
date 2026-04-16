const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/index.js');
const { withSchemaOption } = require('./schemaOption.js');

const Student = sequelize.define('students', {
    student_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    roll_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    department: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    course: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    program: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    section: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    class_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    academic_year: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    semester: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'admin_users',
            key: 'admin_id',
        },
    },
}, withSchemaOption('students', {
    timestamps: true,
}));

module.exports = Student;
