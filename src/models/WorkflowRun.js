const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database'); 

const WorkflowRun = sequelize.define('WorkflowRun', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workflowId: { type: DataTypes.UUID, allowNull: false, references: { model: 'Workflows', key: 'id' } },
    status: { type: DataTypes.ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED'), defaultValue: 'PENDING' }, 
    startTime: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    endTime: { type: DataTypes.DATE, allowNull: true },
    nodeLogs: { type: DataTypes.JSONB, defaultValue: [] }, 
}, { 
    indexes: [{ fields: ['workflowId'] }]
});

module.exports = WorkflowRun;