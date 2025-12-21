/**
 * Abstract base class for all workflow nodes
 */
export class BaseNode {
    constructor(type, label, config) {
        if (new.target === BaseNode) {
            throw new TypeError("Cannot construct BaseNode instances directly");
        }
        
        this.type = type;
        this.label = label;
        this.config = config;
    }

    /**
     * Validate node configuration
     * Must be implemented by subclasses
     * @throws {Error} if configuration is invalid
     * @returns {Object} validated configuration
     */
    validate() {
        throw new Error("validate() must be implemented by subclass");
    }

    /**
     * Execute the node logic
     * Must be implemented by subclasses
     * @param {Object} context - Execution context with payload, results, etc.
     * @returns {Promise<Object>} execution result
     */
    async execute(context) {
        throw new Error("execute() must be implemented by subclass");
    }

    /**
     * Get node schema for documentation/UI
     * @returns {Object} schema definition
     */
    static getSchema() {
        return {
            type: this.TYPE,
            name: this.NAME,
            description: this.DESCRIPTION,
            configSchema: this.CONFIG_SCHEMA
        };
    }

    /**
     * Create a node instance from configuration
     * @param {string} label - Node label
     * @param {Object} config - Node configuration
     * @returns {BaseNode} node instance
     */
    static create(label, config) {
        throw new Error("create() must be implemented by subclass");
    }

    /**
     * Serialize node to JSON
     * @returns {Object} serialized node
     */
    toJSON() {
        return {
            type: this.type,
            label: this.label,
            config: this.config
        };
    }
}

/**
 * Helper function to replace template variables in strings
 * @param {string} template - String with {{variables}}
 * @param {Object} context - Context object with data
 * @returns {string} resolved string
 */
export function resolveTemplate(template, context) {
    if (typeof template !== 'string') {
        return template;
    }

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const keys = path.trim().split('.');
        let value = context;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return match; // Keep original if path not found
            }
        }
        
        return value !== undefined ? value : match;
    });
}

/**
 * Deep resolve all templates in an object
 * @param {any} obj - Object to resolve
 * @param {Object} context - Context data
 * @returns {any} resolved object
 */
export function deepResolveTemplates(obj, context) {
    if (typeof obj === 'string') {
        return resolveTemplate(obj, context);
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => deepResolveTemplates(item, context));
    }
    
    if (obj && typeof obj === 'object') {
        const resolved = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[key] = deepResolveTemplates(value, context);
        }
        return resolved;
    }
    
    return obj;
}