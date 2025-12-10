// src/api/middleware/authMiddleware.js
const authMiddleware = (req, res, next) => {
    // In a real application, this would validate a JWT token,
    // look up the user, and attach user data (e.g., userId) to req.user.
    
    // Mock user for testing CRUD and Webhook (Important: Workflow model requires userId)
    req.user = { id: 'mock-user-123' }; 
    next();
};

module.exports = authMiddleware;