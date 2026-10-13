// src/workflow/nodes/LLMAnalyzeNode.js
import { BaseNode, resolveTemplate } from './BaseNode.js';
import Anthropic from '@anthropic-ai/sdk';

// Created lazily so a missing API key only fails workflows that use this node
let client = null;
const getClient = () => {
    if (!client) {
        client = new Anthropic(); // reads ANTHROPIC_API_KEY
    }
    return client;
};

// Fixed output shape so downstream nodes (e.g. conditional) can rely on the fields
const ANALYSIS_SCHEMA = {
    type: 'object',
    properties: {
        format: { type: 'string', description: 'e.g. json-object, json-array, xml, html, csv, plain-text' },
        isValid: { type: 'boolean', description: 'Whether the data matches the expected format' },
        inferredSchema: { type: 'string', description: 'Field names and types, as a compact description' },
        recordCount: { type: 'integer', description: 'Number of top-level records (1 for a single object)' },
        issues: { type: 'array', items: { type: 'string' }, description: 'Malformed, missing or inconsistent fields' },
        summary: { type: 'string', description: 'Short summary of the content' }
    },
    required: ['format', 'isValid', 'inferredSchema', 'recordCount', 'issues', 'summary'],
    additionalProperties: false
};

const SYSTEM_PROMPT =
    'You analyse data returned by HTTP APIs. Identify its format and structure, ' +
    'report malformed or inconsistent fields, and summarise the content.';

export class LLMAnalyzeNode extends BaseNode {
    static TYPE = 'llm_analyze';
    static NAME = 'LLM Analyze';
    static DESCRIPTION = 'Use Claude to analyse the format and structure of data (e.g. an API response)';

    static CONFIG_SCHEMA = {
        input: { type: 'string', required: false, description: 'Template path to the data, e.g. "{{previousResult.data}}". Defaults to previousResult.data' },
        instructions: { type: 'string', required: false, description: 'Extra instructions, e.g. the expected format' },
        model: { type: 'string', required: false, default: 'claude-opus-5-5', description: 'Claude model ID' },
        maxInputChars: { type: 'number', required: false, default: 100000, description: 'Fail instead of sending inputs larger than this' }
    };

    constructor(label, config) {
        super(LLMAnalyzeNode.TYPE, label, config);
    }

    validate() {
        const { input, instructions, model, maxInputChars } = this.config;

        if (input !== undefined && typeof input !== 'string') {
            throw new Error('input must be a template string');
        }

        if (instructions !== undefined && typeof instructions !== 'string') {
            throw new Error('instructions must be a string');
        }

        if (model !== undefined && typeof model !== 'string') {
            throw new Error('model must be a string');
        }

        if (maxInputChars !== undefined && (typeof maxInputChars !== 'number' || maxInputChars <= 0)) {
            throw new Error('maxInputChars must be a positive number');
        }

        return {
            input: input || null,
            instructions: instructions || null,
            model: model || 'claude-opus-5-5',
            maxInputChars: maxInputChars || 100000
        };
    }

    /**
     * Get the data to analyse: explicit template path, else the previous node's response body
     * @param {Object} context - Execution context
     * @returns {any} data to analyse
     */
    getInputData(context) {
        const { input } = this.config;

        if (input) {
            const match = input.match(/^\{\{([^}]+)\}\}$/);
            if (match) {
                // Pure path - fetch the raw value so objects stay objects
                return match[1].trim().split('.').reduce(
                    (value, key) => (value && typeof value === 'object' ? value[key] : undefined),
                    context
                );
            }
            return resolveTemplate(input, context);
        }

        return context.previousResult?.data ?? context.previousResult;
    }

    async execute(context) {
        try {
            const { instructions, model, maxInputChars } = this.validate();
            const data = this.getInputData(context);

            if (data === undefined || data === null) {
                throw new Error('No input data to analyse (set "input" or connect a predecessor node)');
            }

            const raw = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

            // Refuse rather than truncate - a partial sample gives a misleading format analysis
            if (raw.length > maxInputChars) {
                throw new Error(`Input is ${raw.length} chars, exceeds maxInputChars (${maxInputChars})`);
            }

            console.log(`[LLM Node] Analysing ${raw.length} chars with ${model}`);

            const response = await getClient().messages.create({
                model,
                max_tokens: 16000,
                output_config: {
                    effort: 'low',
                    format: { type: 'json_schema', schema: ANALYSIS_SCHEMA }
                },
                system: SYSTEM_PROMPT,
                messages: [{
                    role: 'user',
                    content: (instructions ? `Instructions: ${instructions}\n\n` : '') +
                             `<api_response>\n${raw}\n</api_response>`
                }]
            });

            if (response.stop_reason === 'refusal') {
                throw new Error(`Model declined: ${response.stop_details?.explanation ?? 'no details'}`);
            }

            if (response.stop_reason === 'max_tokens') {
                throw new Error('Model output hit max_tokens before finishing');
            }

            const text = response.content.find(block => block.type === 'text')?.text;
            if (!text) {
                throw new Error('Model returned no text output');
            }

            const analysis = JSON.parse(text);

            console.log(`[LLM Node] format=${analysis.format} valid=${analysis.isValid} issues=${analysis.issues.length}`);

            return {
                success: true,
                analysis,
                model: response.model,
                usage: {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens
                },
                executedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error(`[LLM Node] Analysis failed:`, error.message);

            return {
                success: false,
                error: error.message,
                executedAt: new Date().toISOString()
            };
        }
    }

    static create(label, config) {
        const node = new LLMAnalyzeNode(label, config);
        node.validate();
        return node;
    }
}

export default LLMAnalyzeNode;
