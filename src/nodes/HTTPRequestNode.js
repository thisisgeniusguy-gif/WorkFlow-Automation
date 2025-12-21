// src/workflow/nodes/HttpRequestNode.js
import { BaseNode, deepResolveTemplates } from './BaseNode.js';
import axios from 'axios';

export class HttpRequestNode extends BaseNode {
    static TYPE = 'http_request';
    static NAME = 'HTTP Request';
    static DESCRIPTION = 'Make HTTP/REST API calls to external services';
    
    static CONFIG_SCHEMA = {
        url: { type: 'string', required: true, description: 'API endpoint URL' },
        method: { 
            type: 'string', 
            required: true, 
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            description: 'HTTP method'
        },
        headers: { type: 'object', required: false, description: 'Request headers' },
        body: { type: 'any', required: false, description: 'Request body (for POST/PUT/PATCH)' },
        timeout: { type: 'number', required: false, default: 30000, description: 'Timeout in milliseconds' },
        followRedirects: { type: 'boolean', required: false, default: true },
        validateStatus: { type: 'boolean', required: false, default: true }
    };

    constructor(label, config) {
        super(HttpRequestNode.TYPE, label, config);
    }

    validate() {
        const { url, method, headers, body, timeout } = this.config;

        // Validate required fields
        if (!url || typeof url !== 'string') {
            throw new Error('HTTP node requires a valid URL string');
        }

        if (!method) {
            throw new Error('HTTP node requires a method');
        }

        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
        if (!validMethods.includes(method.toUpperCase())) {
            throw new Error(`Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`);
        }

        // Validate headers if provided
        if (headers && typeof headers !== 'object') {
            throw new Error('Headers must be an object');
        }

        // Validate timeout
        if (timeout !== undefined && (typeof timeout !== 'number' || timeout < 0)) {
            throw new Error('Timeout must be a positive number');
        }

        return {
            url,
            method: method.toUpperCase(),
            headers: headers || {},
            body: body || null,
            timeout: timeout || 30000,
            followRedirects: this.config.followRedirects !== false,
            validateStatus: this.config.validateStatus !== false
        };
    }

    async execute(context) {
        try {
            // Resolve all template variables in config
            const resolvedConfig = deepResolveTemplates(this.config, context);

            const requestConfig = {
                url: resolvedConfig.url,
                method: resolvedConfig.method,
                headers: resolvedConfig.headers,
                timeout: resolvedConfig.timeout,
                maxRedirects: resolvedConfig.followRedirects ? 5 : 0,
                validateStatus: resolvedConfig.validateStatus ? 
                    (status) => status >= 200 && status < 300 : 
                    () => true
            };

            // Add body for methods that support it
            if (['POST', 'PUT', 'PATCH'].includes(resolvedConfig.method) && resolvedConfig.body) {
                requestConfig.data = resolvedConfig.body;
            }

            // Add query params if they exist
            if (resolvedConfig.params) {
                requestConfig.params = resolvedConfig.params;
            }

            console.log(`[HTTP Node] ${resolvedConfig.method} ${resolvedConfig.url}`);

            const response = await axios(requestConfig);

            return {
                success: true,
                statusCode: response.status,
                headers: response.headers,
                data: response.data,
                executedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error(`[HTTP Node] Request failed:`, error.message);

            return {
                success: false,
                error: error.message,
                statusCode: error.response?.status || null,
                data: error.response?.data || null,
                executedAt: new Date().toISOString()
            };
        }
    }

    static create(label, config) {
        const node = new HttpRequestNode(label, config);
        node.validate(); // Validate on creation
        return node;
    }
}

export default HttpRequestNode;