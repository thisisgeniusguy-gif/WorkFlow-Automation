// src/config/database.js
const { Sequelize } = require('sequelize');

// Using an in-memory SQLite database for simplicity, allowing the code to run locally
// In production, replace with: 
// new Sequelize('postgres://user:pass@host:5432/dbname');
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './flow_db.sqlite', // File storage for persistence
    logging: false
});

const connection = {
    // BullMQ requires Redis connection details
    // In a real app, load this from environment variables
    host: '127.0.0.1', 
    port: 6379, 
};

module.exports = { sequelize, connection };