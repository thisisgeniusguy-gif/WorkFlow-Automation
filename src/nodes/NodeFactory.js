// src/workflow/nodes/NodeFactory.js
import HttpRequestNode from './HTTPRequestNode.js';
import ConditionalNode from './ConditionalNode.js';
import DelayNode from './DelayNode.js';
import NotificationNode from './NotifyNode.js';

/**
 * Node Factory - Creates and manages workflow nodes
 */
export class NodeFactory {
    static nodeTypes = new Map();

    /**
     * Register all available node types
     */
    static initialize() {
        this.register(HttpRequestNode);
        this.register(ConditionalNode);
        this.register(DelayNode);
        this.register(NotificationNode);
    }

    /**
     * Register a node type
     * @param {Class} NodeClass - Node class to register
     */
    static register(NodeClass) {
        if (!NodeClass.TYPE) {
            throw new Error('Node class must have a static TYPE property');
        }
        this.nodeTypes.set(NodeClass.TYPE, NodeClass);
        console.log(`[NodeFactory] Registered node type: ${NodeClass.TYPE}`);
    }

    /**
     * Create a node instance
     * @param {string} type - Node type
     * @param {string} label - Node label
     * @param {Object} config - Node configuration
     * @returns {BaseNode} node instance
     */
    static createNode(type, label, config) {
        const NodeClass = this.nodeTypes.get(type);
        
        if (!NodeClass) {
            throw new Error(`Unknown node type: ${type}. Available types: ${this.getAvailableTypes().join(', ')}`);
        }

        try {
            return NodeClass.create(label, config);
        } catch (error) {
            throw new Error(`Failed to create ${type} node: ${error.message}`);
        }
    }

    /**
     * Validate node configuration without creating instance
     * @param {string} type - Node type
     * @param {Object} config - Node configuration
     * @returns {Object} validated configuration
     */
    static validateConfig(type, config) {
        const NodeClass = this.nodeTypes.get(type);
        
        if (!NodeClass) {
            throw new Error(`Unknown node type: ${type}`);
        }

        const tempNode = new NodeClass('temp', config);
        return tempNode.validate();
    }

    /**
     * Get all available node types
     * @returns {Array<string>} array of node type strings
     */
    static getAvailableTypes() {
        return Array.from(this.nodeTypes.keys());
    }

    /**
     * Get schema for a specific node type
     * @param {string} type - Node type
     * @returns {Object} node schema
     */
    static getSchema(type) {
        const NodeClass = this.nodeTypes.get(type);
        
        if (!NodeClass) {
            throw new Error(`Unknown node type: ${type}`);
        }

        return NodeClass.getSchema();
    }

    /**
     * Get schemas for all node types
     * @returns {Object} map of type to schema
     */
    static getAllSchemas() {
        const schemas = {};
        
        for (const [type, NodeClass] of this.nodeTypes.entries()) {
            schemas[type] = NodeClass.getSchema();
        }
        
        return schemas;
    }

    /**
     * Check if a node type exists
     * @param {string} type - Node type
     * @returns {boolean}
     */
    static hasType(type) {
        return this.nodeTypes.has(type);
    }

    /**
     * Execute a node
     * @param {string} type - Node type
     * @param {string} label - Node label
     * @param {Object} config - Node configuration
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} execution result
     */
    static async executeNode(type, label, config, context) {
        const node = this.createNode(type, label, config);
        return await node.execute(context);
    }
}

// Initialize with all node types
NodeFactory.initialize();

export default NodeFactory;