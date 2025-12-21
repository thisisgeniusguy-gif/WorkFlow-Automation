// src/utils/ExecutionLogger.js
/**
 * ExecutionLogger - Centralized logging utility for workflow execution
 * Provides consistent log structure and formatting
 */

class ExecutionLogger {
    /**
     * Create a structured execution log entry
     * @param {Object} params - Log parameters
     * @returns {Object} Structured log entry
     */
    static createLog({
        nodeId,
        nodeType,
        nodeLabel,
        status, // 'queued', 'running', 'success', 'failed', 'skipped', 'waiting'
        startTime,
        endTime,
        duration,
        input = null,
        output = null,
        outputPreview = null,
        error = null,
        metadata = {}
    }) {
        const log = {
            nodeId,
            nodeType,
            nodeLabel,
            status,
            timestamp: endTime || new Date(),
            startTime: startTime || null,
            endTime: endTime || null,
            duration: duration || null,
            metadata: {
                workerId: process.pid,
                timestamp: new Date().toISOString(),
                ...metadata
            }
        };

        // Add input if provided (usually for debugging)
        if (input !== null && input !== undefined) {
            log.input = this.sanitizeData(input);
        }

        // Add output with both full and preview versions
        if (output !== null && output !== undefined) {
            log.output = output;
            log.outputPreview = outputPreview || this.createPreview(output);
        }

        // Add error information if failed
        if (error) {
            log.error = {
                message: error.message || String(error),
                name: error.name || 'Error',
                stack: error.stack || null
            };
        }

        return log;
    }

    /**
     * Create a preview of data for display
     * @param {*} data - Data to preview
     * @param {number} maxLength - Maximum preview length
     * @returns {Object|string} Preview object or original data
     */
    static createPreview(data, maxLength = 300) {
        if (data === null || data === undefined) {
            return data;
        }

        try {
            const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            
            if (str.length > maxLength) {
                return {
                    preview: str.substring(0, maxLength) + '...',
                    truncated: true,
                    originalLength: str.length,
                    type: typeof data
                };
            }
            
            return data;
        } catch (error) {
            return {
                error: 'Failed to create preview',
                type: typeof data
            };
        }
    }

    /**
     * Sanitize data for logging (remove sensitive info)
     * @param {*} data - Data to sanitize
     * @returns {*} Sanitized data
     */
    static sanitizeData(data) {
        if (typeof data !== 'object' || data === null) {
            return data;
        }

        const sensitiveKeys = [
            'password', 'token', 'apiKey', 'secret', 'authorization',
            'api_key', 'api_secret', 'auth_token', 'access_token'
        ];

        const sanitize = (obj) => {
            if (Array.isArray(obj)) {
                return obj.map(item => sanitize(item));
            }

            if (typeof obj === 'object' && obj !== null) {
                const sanitized = {};
                for (const [key, value] of Object.entries(obj)) {
                    const lowerKey = key.toLowerCase();
                    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
                        sanitized[key] = '[REDACTED]';
                    } else {
                        sanitized[key] = sanitize(value);
                    }
                }
                return sanitized;
            }

            return obj;
        };

        return sanitize(data);
    }

    /**
     * Format execution log for display
     * @param {Object} log - Execution log
     * @returns {Object} Formatted log
     */
    static formatForDisplay(log) {
        return {
            nodeId: log.nodeId,
            nodeType: log.nodeType,
            nodeLabel: log.nodeLabel,
            status: log.status,
            timestamp: log.timestamp,
            duration: log.duration ? `${log.duration}ms` : null,
            output: log.outputPreview || log.output,
            error: log.error ? log.error.message : null,
            metadata: {
                attemptNumber: log.metadata?.attemptNumber,
                workerId: log.metadata?.workerId
            }
        };
    }

    /**
     * Extract summary from execution logs
     * @param {Array} logs - Array of execution logs
     * @returns {Object} Execution summary
     */
    static summarize(logs) {
        const summary = {
            total: logs.length,
            byStatus: {},
            byNodeType: {},
            totalDuration: 0,
            errors: []
        };

        logs.forEach(log => {
            // Count by status
            summary.byStatus[log.status] = (summary.byStatus[log.status] || 0) + 1;
            
            // Count by node type
            summary.byNodeType[log.nodeType] = (summary.byNodeType[log.nodeType] || 0) + 1;
            
            // Sum duration
            if (log.duration) {
                summary.totalDuration += log.duration;
            }
            
            // Collect errors
            if (log.status === 'failed' && log.error) {
                summary.errors.push({
                    nodeId: log.nodeId,
                    nodeLabel: log.nodeLabel,
                    error: log.error.message
                });
            }
        });

        return summary;
    }
}

export default ExecutionLogger;