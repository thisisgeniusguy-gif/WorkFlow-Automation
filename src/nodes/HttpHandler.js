const axios = require('axios');

async function execute(config, context) {
    console.log(`Executing HTTP Request: ${config.method} ${config.url}`);
    const startTime = Date.now();

    try {
        const response = await axios({
            method: config.method, // e.g., 'GET', 'POST'
            url: config.url,
            headers: config.headers,
            data: config.body
        });

        const duration = Date.now() - startTime;
        
        return {
            success: true,
            output: {
                statusCode: response.status,
                data: response.data 
            },
            duration
        };
    } catch (error) {
        throw new Error(`HTTP Request failed: ${error.message}`); 
    }
}

module.exports = { execute };