// ============================================
// 4. Auth Routes (routes/auth.routes.js)
// ============================================
import express from 'express';
import User from '../../models/User.js';
import { generateToken } from '../../utils/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const user = new User({ email, password, name });
        await user.save();

        console.log(`New user registered: ${email}`);

        const token = generateToken(user._id);

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user._id);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                usage: user.usage,
                limits: user.limits
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
    res.json({
        user: {
            id: req.user._id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role,
            usage: req.user.usage,
            limits: req.user.limits
        }
    });
});

// Update profile
router.put('/profile', authenticate, async (req, res) => {
    try {
        const { name } = req.body;
        
        if (name) {
            req.user.name = name;
            await req.user.save();
        }

        res.json({
            message: 'Profile updated',
            user: {
                id: req.user._id,
                email: req.user.email,
                name: req.user.name,
                role: req.user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change password
router.put('/password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user._id);
        const isMatch = await user.comparePassword(currentPassword);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
