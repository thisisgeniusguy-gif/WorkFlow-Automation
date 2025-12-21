// test-middleware-setup.js - Verify your middleware is set up correctly
import express from 'express';

const app = express();
app.use(express.json());

// ============================================
// TEST 1: Verify Middleware Signature
// ============================================

console.log('\n🧪 TEST 1: Testing Middleware Signatures\n');

// Mock middleware - CORRECT pattern
const correctMiddleware = async (req, res, next) => {
    console.log('✅ Middleware called with next parameter');
    req.testValue = 'from middleware';
    next();
};

// Mock handler - CORRECT pattern
const correctHandler = async (req, res) => {
    console.log('✅ Handler called without next parameter');
    res.json({ 
        message: 'Success',
        testValue: req.testValue 
    });
};

// Test route
app.get('/test/correct', correctMiddleware, correctHandler);

// ============================================
// TEST 2: Verify Error When Missing next
// ============================================

console.log('🧪 TEST 2: Testing Missing next Parameter\n');

// This will cause "next is not a function" error
const brokenMiddleware = async (req, res) => {  // ❌ Missing next parameter
    console.log('❌ This middleware is missing next');
    req.testValue = 'broken';
    // next(); // ← This would cause error: next is not a function
    res.json({ error: 'This should not work' });
};

app.get('/test/broken', brokenMiddleware, correctHandler);

// ============================================
// TEST 3: Your Actual Middleware
// ============================================

console.log('🧪 TEST 3: Testing Your Auth Middleware\n');

// Import your actual middleware
let authenticate, checkUsageLimit;
try {
    const authModule = await import('./src/api/middleware/auth.js');
    authenticate = authModule.authenticate;
    checkUsageLimit = authModule.checkUsageLimit;
    
    console.log('✅ Successfully imported auth middleware');
    console.log(`   - authenticate: ${authenticate ? 'Found' : 'Missing'}`);
    console.log(`   - checkUsageLimit: ${checkUsageLimit ? 'Found' : 'Missing'}`);
    
    // Check function signatures
    if (authenticate) {
        const funcStr = authenticate.toString();
        const hasNext = funcStr.includes('next');
        console.log(`   - authenticate has 'next': ${hasNext ? '✅' : '❌'}`);
    }
    
    if (checkUsageLimit) {
        const funcStr = checkUsageLimit.toString();
        const hasNext = funcStr.includes('next');
        console.log(`   - checkUsageLimit has 'next': ${hasNext ? '✅' : '❌'}`);
    }
} catch (error) {
    console.log('❌ Could not import auth middleware:', error.message);
}

// ============================================
// TEST 4: Import Controller Functions
// ============================================

console.log('\n🧪 TEST 4: Testing Controller Functions\n');

try {
    const controllerModule = await import('./src/api/controllers/workflow.controller.js');
    
    const functions = Object.keys(controllerModule);
    console.log(`✅ Successfully imported controller (${functions.length} exports)`);
    
    // Check if any controller function has 'next' parameter
    let hasNextIssue = false;
    functions.forEach(name => {
        const func = controllerModule[name];
        if (typeof func === 'function') {
            const funcStr = func.toString();
            // Check function signature
            const signature = funcStr.match(/(?:async\s+)?(?:function\s+)?\w*\s*\(([^)]*)\)/);
            if (signature && signature[1]) {
                const params = signature[1].split(',').map(p => p.trim());
                if (params.includes('next')) {
                    console.log(`   ❌ ${name} has 'next' parameter (should be removed)`);
                    hasNextIssue = true;
                }
            }
        }
    });
    
    if (!hasNextIssue) {
        console.log('   ✅ No controller functions have next parameter');
    }
} catch (error) {
    console.log('❌ Could not import controller:', error.message);
}

// ============================================
// TEST 5: Test Route Setup
// ============================================

console.log('\n🧪 TEST 5: Testing Route Setup\n');

try {
    const routesModule = await import('./src/api/routes/workflow.routes.js');
    console.log('✅ Successfully imported routes');
    
    // The routes module should export a router
    const router = routesModule.default;
    if (router && router.stack) {
        console.log(`   Found ${router.stack.length} route handlers`);
    }
} catch (error) {
    console.log('❌ Could not import routes:', error.message);
}

// ============================================
// TEST 6: Run Test Server
// ============================================

console.log('\n🧪 TEST 6: Starting Test Server\n');

// Test endpoint
app.get('/test/hello', (req, res) => {
    res.json({ message: 'Test server is working' });
});

// Test with mock auth
const mockAuth = (req, res, next) => {
    req.user = {
        _id: 'test_user_id',
        email: 'test@example.com',
        limits: { maxWorkflows: 10 },
        usage: { executionsToday: 5 },
        canExecuteWorkflow: () => ({ allowed: true })
    };
    next();
};

app.get('/test/with-auth', mockAuth, (req, res) => {
    res.json({ 
        message: 'Auth middleware works',
        user: req.user.email 
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('\n❌ Error caught:');
    console.error('   Message:', err.message);
    console.error('   Route:', req.method, req.path);
    console.error('   Stack:', err.stack);
    res.status(500).json({ error: err.message });
});

// Start server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n✅ Test server running on http://localhost:${PORT}\n`);
    console.log('Try these tests:\n');
    console.log(`  curl http://localhost:${PORT}/test/hello`);
    console.log(`  curl http://localhost:${PORT}/test/correct`);
    console.log(`  curl http://localhost:${PORT}/test/with-auth`);
    console.log(`  curl http://localhost:${PORT}/test/broken  # Should show the error\n`);
    console.log('Press Ctrl+C to stop\n');
});

// ============================================
// SUMMARY
// ============================================

console.log('📋 SUMMARY OF CHECKS:\n');
console.log('1. ✅ Correct middleware pattern demonstrated');
console.log('2. ✅ Broken middleware pattern demonstrated');
console.log('3. Check auth middleware imports above');
console.log('4. Check controller function signatures above');
console.log('5. Check route setup above');
console.log('6. Test server started - try the curl commands\n');
console.log('If any checks failed, review the output above.\n');