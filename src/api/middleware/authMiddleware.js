// src/api/middleware/authMiddleware.js
const authMiddleware = (req, res, next) => {
    // In a real application, this would validate a JWT token,
    // look up the user, and attach user data (e.g., userId) to req.user.
    
    // Mock user for testing CRUD and Webhook (Important: Workflow model requires userId)
    req.user = { id: '651a94e82b3d1c001f3f6e12' }; 
    next();
};

export default authMiddleware;