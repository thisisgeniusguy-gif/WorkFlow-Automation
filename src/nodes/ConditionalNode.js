// src/workflow/nodes/ConditionalNode.js
import { BaseNode, resolveTemplate } from './BaseNode.js';

export class ConditionalNode extends BaseNode {
    static TYPE = 'conditional';
    static NAME = 'Conditional Logic';
    static DESCRIPTION = 'Branch workflow execution based on conditions';
    
    static CONFIG_SCHEMA = {
        condition: {
            type: 'object',
            required: true,
            properties: {
                field: { type: 'string', required: true, description: 'Field path to evaluate (e.g., "payload.amount")' },
                operator: { 
                    type: 'string', 
                    required: true, 
                    enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'exists', 'not_exists'],
                    description: 'Comparison operator'
                },
                value: { type: 'any', required: false, description: 'Value to compare against' }
            }
        },
        truePath: { type: 'string', required: false, description: 'Node ID to execute if condition is true' },
        falsePath: { type: 'string', required: false, description: 'Node ID to execute if condition is false' }
    };

    constructor(label, config) {
        super(ConditionalNode.TYPE, label, config);
    }

    validate() {
        const { condition } = this.config;

        if (!condition || typeof condition !== 'object') {
            throw new Error('Conditional node requires a condition object');
        }

        if (!condition.field || typeof condition.field !== 'string') {
            throw new Error('Condition requires a field path string');
        }

        if (!condition.operator) {
            throw new Error('Condition requires an operator');
        }

        const validOperators = [
            'equals', 'not_equals', 'contains', 'not_contains',
            'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal',
            'exists', 'not_exists'
        ];

        if (!validOperators.includes(condition.operator)) {
            throw new Error(`Invalid operator. Must be one of: ${validOperators.join(', ')}`);
        }

        // Validate that value exists for operators that need it
        const operatorsNeedingValue = [
            'equals', 'not_equals', 'contains', 'not_contains',
            'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'
        ];

        if (operatorsNeedingValue.includes(condition.operator) && condition.value === undefined) {
            throw new Error(`Operator "${condition.operator}" requires a value`);
        }

        return {
            condition: {
                field: condition.field,
                operator: condition.operator,
                value: condition.value
            },
            truePath: this.config.truePath || null,
            falsePath: this.config.falsePath || null
        };
    }

    /**
     * Get value from context using dot notation path
     * @param {string} path - Dot notation path (e.g., "payload.user.name")
     * @param {Object} context - Context object
     * @returns {any} value at path
     */
    getValueFromPath(path, context) {
        const keys = path.split('.');
        let value = context;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    /**
     * Evaluate the condition
     * @param {any} fieldValue - Value from the field path
     * @param {string} operator - Comparison operator
     * @param {any} compareValue - Value to compare against
     * @returns {boolean} evaluation result
     */
    evaluateCondition(fieldValue, operator, compareValue) {
        switch (operator) {
            case 'equals':
                return fieldValue == compareValue; // Loose equality
            
            case 'not_equals':
                return fieldValue != compareValue;
            
            case 'contains':
                if (typeof fieldValue === 'string') {
                    return fieldValue.includes(String(compareValue));
                }
                if (Array.isArray(fieldValue)) {
                    return fieldValue.includes(compareValue);
                }
                return false;
            
            case 'not_contains':
                if (typeof fieldValue === 'string') {
                    return !fieldValue.includes(String(compareValue));
                }
                if (Array.isArray(fieldValue)) {
                    return !fieldValue.includes(compareValue);
                }
                return true;
            
            case 'greater_than':
                return Number(fieldValue) > Number(compareValue);
            
            case 'less_than':
                return Number(fieldValue) < Number(compareValue);
            
            case 'greater_or_equal':
                return Number(fieldValue) >= Number(compareValue);
            
            case 'less_or_equal':
                return Number(fieldValue) <= Number(compareValue);
            
            case 'exists':
                return fieldValue !== undefined && fieldValue !== null;
            
            case 'not_exists':
                return fieldValue === undefined || fieldValue === null;
            
            default:
                throw new Error(`Unknown operator: ${operator}`);
        }
    }

    async execute(context) {
        try {
            const { condition } = this.config;

            // Resolve template in field path if needed
            const fieldPath = resolveTemplate(condition.field, context);
            
            // Get the actual value from context
            const fieldValue = this.getValueFromPath(fieldPath, context);
            
            // Resolve template in compare value if it's a string
            const compareValue = typeof condition.value === 'string' 
                ? resolveTemplate(condition.value, context)
                : condition.value;

            // Evaluate the condition
            const result = this.evaluateCondition(fieldValue, condition.operator, compareValue);

            console.log(`[Conditional Node] ${fieldPath} ${condition.operator} ${compareValue} = ${result}`);
            console.log(`[Conditional Node] Field value: ${JSON.stringify(fieldValue)}`);

            return {
                success: true,
                conditionMet: result,
                evaluatedField: fieldPath,
                fieldValue: fieldValue,
                operator: condition.operator,
                compareValue: compareValue,
                nextPath: result ? 'true' : 'false',
                executedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error(`[Conditional Node] Evaluation failed:`, error.message);

            return {
                success: false,
                conditionMet: false,
                error: error.message,
                executedAt: new Date().toISOString()
            };
        }
    }

    static create(label, config) {
        const node = new ConditionalNode(label, config);
        node.validate();
        return node;
    }
}

export default ConditionalNode;