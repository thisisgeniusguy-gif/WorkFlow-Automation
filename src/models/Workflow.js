const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Workflow = sequelize.define('Workflow', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    definition: { type: DataTypes.JSONB, allowNull: false }, 
    status: { type: DataTypes.ENUM('Draft', 'Published'), defaultValue: 'Draft' }, 
    webhookSecret: { type: DataTypes.STRING, allowNull: true },
    cronSchedule: { type: DataTypes.STRING, allowNull: true },
}, { 
    paranoid: true
});

module.exports = Workflow;