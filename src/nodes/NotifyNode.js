// src/workflow/nodes/NotificationNode.js
import { BaseNode, deepResolveTemplates } from './BaseNode.js';
import axios from 'axios';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export class NotificationNode extends BaseNode {
    static TYPE = 'notification';
    static NAME = 'Notification';
    static DESCRIPTION = 'Send notifications via Slack or Email';
    
    static CONFIG_SCHEMA = {
        channel: { 
            type: 'string', 
            required: true, 
            enum: ['slack', 'email'],
            description: 'Notification channel'
        },
        // Slack specific
        webhookUrl: { 
            type: 'string', 
            required: false, 
            description: 'Slack webhook URL (required for Slack)' 
        },
        // Email specific
        to: { 
            type: 'string', 
            required: false, 
            description: 'Recipient email address (required for Email)' 
        },
        from: { 
            type: 'string', 
            required: false, 
            description: 'Sender email address' 
        },
        subject: { 
            type: 'string', 
            required: false, 
            description: 'Email subject line' 
        },
        // Common
        message: { 
            type: 'string', 
            required: true, 
            description: 'Message content' 
        },
        // Additional options
        cc: { type: 'string', required: false, description: 'CC email addresses (comma-separated)' },
        bcc: { type: 'string', required: false, description: 'BCC email addresses (comma-separated)' }
    };

    constructor(label, config) {
        super(NotificationNode.TYPE, label, config);
    }

    validate() {
        const { channel, webhookUrl, to, message } = this.config;

        // Validate channel
        if (!channel || !['slack', 'email'].includes(channel)) {
            throw new Error('Notification requires a valid channel (slack or email)');
        }

        // Validate message
        if (!message || typeof message !== 'string') {
            throw new Error('Notification requires a message');
        }

        // Channel-specific validation
        if (channel === 'slack') {
            if (!webhookUrl || typeof webhookUrl !== 'string') {
                throw new Error('Slack notification requires a webhookUrl');
            }
            if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
                console.warn('[Notification Node] Slack webhook URL should start with https://hooks.slack.com/');
            }
        }

        if (channel === 'email') {
            if (!to || typeof to !== 'string') {
                throw new Error('Email notification requires a "to" address');
            }
            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(to.split(',')[0].trim())) {
                throw new Error('Invalid email address format');
            }
        }

        return {
            channel,
            webhookUrl: webhookUrl || null,
            to: to || null,
            from: this.config.from || process.env.EMAIL_FROM || 'noreply@workflow.com',
            subject: this.config.subject || 'Workflow Notification',
            message,
            cc: this.config.cc || null,
            bcc: this.config.bcc || null
        };
    }

    /**
     * Send Slack notification
     * @param {Object} config - Resolved configuration
     * @returns {Promise<Object>} result
     */
    async sendSlack(config) {
        try {
            const payload = {
                text: config.message,
                mrkdwn: true
            };

            const response = await axios.post(config.webhookUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            return {
                success: true,
                channel: 'slack',
                statusCode: response.status,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('[Slack] Failed to send notification:', error.message);
            throw new Error(`Slack notification failed: ${error.message}`);
        }
    }

    /**
     * Send Email notification
     * @param {Object} config - Resolved configuration
     * @returns {Promise<Object>} result
     */
    async sendEmail(config) {
        try {
            // Create transporter (configure based on your email service)
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              host: 'smtp.gmail.com',
              port: 465,
              secure: true, // Use SSL
              auth: {
                user: process.env.EMAIL_USER || '',
                pass: process.env.EMAIL_PASS || '', // Use the 16-character App Password here
              },
            });

            // Email options
            const mailOptions = {
                from: config.from,
                to: config.to,
                subject: config.subject,
                text: config.message,
                html: config.message.replace(/\n/g, '<br>') // Simple HTML conversion
            };

            // Add CC/BCC if provided
            if (config.cc) {
                mailOptions.cc = config.cc;
            }
            if (config.bcc) {
                mailOptions.bcc = config.bcc;
            }

            const info = await transporter.sendMail(mailOptions);

            return {
                success: true,
                channel: 'email',
                messageId: info.messageId,
                to: config.to,
                subject: config.subject,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('[Email] Failed to send notification:', error.message);
            throw new Error(`Email notification failed: ${error.message}`);
        }
    }

    async execute(context) {
        try {
            // Resolve all template variables in config
            const resolvedConfig = deepResolveTemplates(this.config, context);

            console.log(`[Notification Node] Sending ${resolvedConfig.channel} notification`);

            let result;

            if (resolvedConfig.channel === 'slack') {
                result = await this.sendSlack(resolvedConfig);
            } else if (resolvedConfig.channel === 'email') {
                result = await this.sendEmail(resolvedConfig);
            } else {
                throw new Error(`Unsupported channel: ${resolvedConfig.channel}`);
            }

            return {
                ...result,
                message: resolvedConfig.message.substring(0, 100) + '...', // Truncate for logs
                executedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error(`[Notification Node] Execution failed:`, error.message);

            return {
                success: false,
                channel: this.config.channel,
                error: error.message,
                executedAt: new Date().toISOString()
            };
        }
    }

    static create(label, config) {
        const node = new NotificationNode(label, config);
        node.validate();
        return node;
    }
}

export default NotificationNode;