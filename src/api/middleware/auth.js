// ============================================
// 3. Auth Middleware (middleware/auth.js)
// ============================================
import { verifyToken } from '../../utils/auth.js';
import User from '../../models/User.js';

export const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const user = await User.findById(decoded.userId).select('-password');
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
};

export const checkUsageLimit = async (req, res, next) => {
    try {
        const usageCheck = req.user.canExecuteWorkflow();
        
        if (!usageCheck.allowed) {
            return res.status(429).json({ 
                error: usageCheck.reason,
                usage: req.user.usage,
                limits: req.user.limits
            });
        }

        next();
    } catch (error) {
        res.status(500).json({ error: 'Usage check failed' });
    }
};

export const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
