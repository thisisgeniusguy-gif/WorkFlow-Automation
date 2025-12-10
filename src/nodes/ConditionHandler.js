function execute(config, context) {
    // Access a field in the context (data from previous nodes)
    const fieldToEvaluate = context.data[config.field]; 
    
    // Basic evaluation for demonstration
    const isTrue = fieldToEvaluate === 'true' || fieldToEvaluate === true; 

    const nextNodeId = isTrue ? config.truePath : config.falsePath; // Determine branch
    
    return {
        success: true,
        output: { result: isTrue, next: nextNodeId }
    };
}

module.exports = { execute };