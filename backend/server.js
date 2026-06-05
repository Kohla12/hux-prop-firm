/**
 * HUX PROP FIRM - SECURE REAL-TIME BACKEND ENGINE
 * Implements database-backed user authentication, OAuth, payment confirmation,
 * JWT session management, and secure Stripe Hosted Checkout.
 */

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_keys');
const cors = require('cors');
const { ensureDatabaseSchema } = require('./db/migrate');

const app = express();
app.use(express.json());
app.use(cors());

// Configure PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://hux_admin:HUX_secure_db_pass_2026@localhost:5432/hux_prop_firm',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'HUX_FUTURISTIC_SECURE_KEY';
const BCRYPT_SALT_ROUNDS = 12;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@hux-prop-firm.com';

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================
async function initializeApp() {
    try {
        console.log('[HUX Backend] Initializing database schema...');
        await ensureDatabaseSchema();
        console.log('[HUX Backend] ✓ Database ready');
    } catch (error) {
        console.error('[HUX Backend] Failed to initialize database:', error);
        process.exit(1);
    }
}

// ============================================================================
// MIDDLEWARE: JWT VERIFICATION
// ============================================================================
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// ============================================================================
// 1. SECURE USER REGISTRATION (Persisting to PostgreSQL)
// ============================================================================
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // Check if user already exists
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(409).json({ error: 'Email is already registered.' });
        }

        // Hash the password securely using bcrypt before storing
        const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        // Insert new user into PostgreSQL
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role, status) 
             VALUES ($1, $2, $3, $4, 'trader', 'active') 
             RETURNING id, email, role, created_at`,
            [email, passwordHash, firstName || '', lastName || '']
        );

        const newUser = result.rows[0];
        console.log(`[Auth] User registered: ${newUser.email} (${newUser.id})`);

        // Generate secure JWT token
        const token = jwt.sign({ userId: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(201).json({
            message: 'User registered successfully.',
            token,
            user: { id: newUser.id, email: newUser.email, role: newUser.role }
        });

    } catch (error) {
        console.error('Signup Error:', error);
        return res.status(500).json({ error: 'Internal server registration failure.' });
    }
});

// ============================================================================
// 2. SECURE USER LOGIN & VALIDATION (Checking PostgreSQL hashes)
// ============================================================================
app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // Fetch user password hash from database
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        // Verify state status
        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'This profile is currently suspended.' });
        }

        // Compare password safely with bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Generate JWT token session
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        console.log(`[Auth] User logged in: ${user.email} (${user.id})`);

        return res.status(200).json({
            message: 'Authenticated successfully.',
            token,
            user: { id: user.id, email: user.email, role: user.role }
        });

    } catch (error) {
        console.error('Signin Error:', error);
        return res.status(500).json({ error: 'Internal server login failure.' });
    }
});

// ============================================================================
// 3. OAUTH: GOOGLE SIGN-IN
// ============================================================================
app.post('/api/auth/google', async (req, res) => {
    const { idToken, email, firstName, lastName } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    try {
        // Check if user exists
        let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            // Create new user from Google OAuth
            const result = await pool.query(
                `INSERT INTO users (email, first_name, last_name, role, status, oauth_provider) 
                 VALUES ($1, $2, $3, 'trader', 'active', 'google') 
                 RETURNING id, email, role, created_at`,
                [email, firstName || '', lastName || '']
            );
            user = result;
            console.log(`[OAuth] New Google user created: ${email}`);
        } else {
            console.log(`[OAuth] Google user logged in: ${email}`);
        }

        const userData = user.rows[0];

        // Generate JWT token
        const token = jwt.sign({ userId: userData.id, role: userData.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: 'Google authentication successful.',
            token,
            user: { id: userData.id, email: userData.email, role: userData.role }
        });

    } catch (error) {
        console.error('Google OAuth Error:', error);
        return res.status(500).json({ error: 'Google authentication failed.' });
    }
});

// ============================================================================
// 4. OAUTH: APPLE SIGN-IN
// ============================================================================
app.post('/api/auth/apple', async (req, res) => {
    const { identityToken, email, firstName, lastName } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    try {
        // Check if user exists
        let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            // Create new user from Apple OAuth
            const result = await pool.query(
                `INSERT INTO users (email, first_name, last_name, role, status, oauth_provider) 
                 VALUES ($1, $2, $3, 'trader', 'active', 'apple') 
                 RETURNING id, email, role, created_at`,
                [email, firstName || '', lastName || '']
            );
            user = result;
            console.log(`[OAuth] New Apple user created: ${email}`);
        } else {
            console.log(`[OAuth] Apple user logged in: ${email}`);
        }

        const userData = user.rows[0];

        // Generate JWT token
        const token = jwt.sign({ userId: userData.id, role: userData.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: 'Apple authentication successful.',
            token,
            user: { id: userData.id, email: userData.email, role: userData.role }
        });

    } catch (error) {
        console.error('Apple OAuth Error:', error);
        return res.status(500).json({ error: 'Apple authentication failed.' });
    }
});

// ============================================================================
// 5. SECURE STRIPE CHECKOUT INTEGRATION (PCI-Compliant Payment Redirects)
// ============================================================================
app.post('/api/checkout/create-session', verifyToken, async (req, res) => {
    const { challengeType, size, price, successUrl, cancelUrl } = req.body;
    const userId = req.userId;

    try {
        // Get user email
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const userEmail = userResult.rows[0].email;

        // Create secure hosted checkout session on Stripe's PCI-compliant server
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: userEmail,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `HUX ${size} - ${challengeType.toUpperCase()} Challenge`,
                            description: 'Refund-eligible institutional evaluation entry fee.'
                        },
                        unit_amount: Math.round(price * 100) // Stripe requires value in cents
                    },
                    quantity: 1
                }
            ],
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                userId,
                challengeType,
                size,
                email: userEmail
            }
        });

        // Create pending payment record in database
        await pool.query(
            `INSERT INTO payments (user_id, stripe_session_id, amount, status, challenge_type, challenge_size) 
             VALUES ($1, $2, $3, 'pending', $4, $5)`,
            [userId, session.id, price, challengeType, size]
        );

        console.log(`[Payment] Checkout session created for user ${userId}: ${session.id}`);

        // Send payment redirect URL back to client
        return res.status(200).json({ url: session.url });

    } catch (error) {
        console.error('Stripe Session Error:', error);
        return res.status(500).json({ error: 'Unable to initiate Stripe payment checkout.' });
    }
});

// ============================================================================
// 6. STRIPE WEBHOOK (Listening for confirmed payments)
// ============================================================================
app.post('/api/checkout/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Verify webhook signature to prevent spoofing attacks
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata.userId;

        try {
            // Update payment status to completed
            await pool.query(
                `UPDATE payments SET status = 'completed', completed_at = NOW() 
                 WHERE stripe_session_id = $1`,
                [session.id]
            );

            // Create pending admin approval record
            await pool.query(
                `INSERT INTO payment_approvals (user_id, payment_amount, status, stripe_session_id) 
                 VALUES ($1, $2, 'pending', $3)`,
                [userId, session.amount_total / 100, session.id]
            );

            console.log(`[Payment] Payment completed for user ${userId}. Awaiting admin approval.`);

            // TODO: Send email to admin for approval
            // sendAdminApprovalEmail(ADMIN_EMAIL, userId, session.amount_total / 100);

        } catch (dbErr) {
            console.error('Database Webhook processing error:', dbErr);
            return res.status(500).send('Internal Database Webhook error');
        }
    }

    return res.status(200).json({ received: true });
});

// ============================================================================
// 7. ADMIN: GET PENDING PAYMENT APPROVALS
// ============================================================================
app.get('/api/admin/pending-approvals', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }

    try {
        const result = await pool.query(
            `SELECT pa.id, pa.user_id, u.email, u.first_name, u.last_name, 
                    pa.payment_amount, pa.created_at, pa.stripe_session_id
             FROM payment_approvals pa
             JOIN users u ON pa.user_id = u.id
             WHERE pa.status = 'pending'
             ORDER BY pa.created_at DESC`
        );

        return res.status(200).json({ approvals: result.rows });

    } catch (error) {
        console.error('Admin Approvals Error:', error);
        return res.status(500).json({ error: 'Failed to fetch pending approvals.' });
    }
});

// ============================================================================
// 8. ADMIN: APPROVE PAYMENT & PROVISION ACCOUNT
// ============================================================================
app.post('/api/admin/approve-payment', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }

    const { approvalId, challengeType, size } = req.body;

    try {
        // Get approval details
        const approvalResult = await pool.query(
            `SELECT * FROM payment_approvals WHERE id = $1 AND status = 'pending'`,
            [approvalId]
        );

        if (approvalResult.rows.length === 0) {
            return res.status(404).json({ error: 'Approval not found or already processed.' });
        }

        const approval = approvalResult.rows[0];
        const userId = approval.user_id;

        // Update approval status
        await pool.query(
            `UPDATE payment_approvals SET status = 'approved', approved_at = NOW() 
             WHERE id = $1`,
            [approvalId]
        );

        // Create Challenge entry
        const challengeRes = await pool.query(
            `INSERT INTO challenges (user_id, type, size, profit_target, daily_drawdown_limit, max_drawdown_limit, fee) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [
                userId,
                challengeType === '1-step' ? 'one_step' : 'two_step',
                parseFloat(size),
                parseFloat(size) * 0.08, // Target: 8%
                parseFloat(size) * 0.05, // Daily limit: 5%
                parseFloat(size) * 0.10, // Max limit: 10%
                approval.payment_amount
            ]
        );

        // Provision Trading Account Bridge
        const randomLogin = Math.floor(Math.random() * 9000000 + 1000000).toString();
        const accountRes = await pool.query(
            `INSERT INTO trading_accounts (user_id, challenge_id, login_id, server_address, balance, equity, start_balance, daily_base_balance, status) 
             VALUES ($1, $2, $3, 'Hux-Broker-Server-01', $4, $4, $4, $4, 'active') 
             RETURNING id`,
            [userId, challengeRes.rows[0].id, randomLogin, parseFloat(size)]
        );

        // Update user status to indicate they have funded account
        await pool.query(
            `UPDATE users SET status = 'active' WHERE id = $1`,
            [userId]
        );

        console.log(`[Admin] Payment approved for user ${userId}. Account ${randomLogin} provisioned.`);

        return res.status(200).json({
            message: 'Payment approved and account provisioned.',
            tradingAccount: {
                loginId: randomLogin,
                balance: parseFloat(size),
                server: 'Hux-Broker-Server-01'
            }
        });

    } catch (error) {
        console.error('Admin Approval Error:', error);
        return res.status(500).json({ error: 'Failed to approve payment.' });
    }
});

// ============================================================================
// 9. ADMIN: REJECT PAYMENT
// ============================================================================
app.post('/api/admin/reject-payment', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }

    const { approvalId, reason } = req.body;

    try {
        await pool.query(
            `UPDATE payment_approvals SET status = 'rejected', rejection_reason = $1, rejected_at = NOW() 
             WHERE id = $2`,
            [reason || 'No reason provided', approvalId]
        );

        console.log(`[Admin] Payment rejected: ${approvalId}`);

        return res.status(200).json({ message: 'Payment rejected.' });

    } catch (error) {
        console.error('Admin Rejection Error:', error);
        return res.status(500).json({ error: 'Failed to reject payment.' });
    }
});

// ============================================================================
// 10. LINK TRADING PLATFORM
// ============================================================================
app.post('/api/trading/link-platform', verifyToken, async (req, res) => {
    const { accountId, platformType, platformLogin, platformPassword, platformServer } = req.body;
    const userId = req.userId;

    if (!accountId || !platformType || !platformLogin) {
        return res.status(400).json({ error: 'Account ID, platform type, and login are required.' });
    }

    try {
        // Verify account belongs to user
        const accountResult = await pool.query(
            `SELECT id FROM trading_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, userId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Trading account not found.' });
        }

        // Update trading account with platform details
        await pool.query(
            `UPDATE trading_accounts 
             SET broker_platform = $1, login_id = $2, server_address = $3
             WHERE id = $4`,
            [platformType, platformLogin, platformServer || 'Default', accountId]
        );

        console.log(`[Trading] Platform linked for account ${accountId}: ${platformType}`);

        return res.status(200).json({
            message: 'Trading platform linked successfully.',
            account: { id: accountId, platform: platformType }
        });

    } catch (error) {
        console.error('Platform Linking Error:', error);
        return res.status(500).json({ error: 'Failed to link trading platform.' });
    }
});

// ============================================================================
// 11. GET USER TRADING ACCOUNTS
// ============================================================================
app.get('/api/trading/accounts', verifyToken, async (req, res) => {
    const userId = req.userId;

    try {
        const result = await pool.query(
            `SELECT ta.id, ta.login_id, ta.broker_platform, ta.balance, ta.equity, 
                    ta.status, ta.created_at, c.type as challenge_type, c.size
             FROM trading_accounts ta
             LEFT JOIN challenges c ON ta.challenge_id = c.id
             WHERE ta.user_id = $1
             ORDER BY ta.created_at DESC`,
            [userId]
        );

        return res.status(200).json({ accounts: result.rows });

    } catch (error) {
        console.error('Get Accounts Error:', error);
        return res.status(500).json({ error: 'Failed to fetch trading accounts.' });
    }
});

// ============================================================================
// 12. GET USER PROFILE
// ============================================================================
app.get('/api/user/profile', verifyToken, async (req, res) => {
    const userId = req.userId;

    try {
        const result = await pool.query(
            `SELECT id, email, first_name, last_name, role, status, oauth_provider, created_at 
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        return res.status(200).json({ user: result.rows[0] });

    } catch (error) {
        console.error('Get Profile Error:', error);
        return res.status(500).json({ error: 'Failed to fetch user profile.' });
    }
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        return res.status(200).json({
            status: 'healthy',
            database: 'connected',
            timestamp: result.rows[0].now
        });
    } catch (error) {
        return res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Start listening
const PORT = process.env.PORT || 8080;

initializeApp().then(() => {
    app.listen(PORT, () => {
        console.log(`[HUX Backend Engine] running securely on port ${PORT}`);
        console.log(`[HUX Backend Engine] Database: ${process.env.DATABASE_URL ? 'Railway Postgres' : 'Local'}`);
        console.log(`[HUX Backend Engine] Admin Email: ${ADMIN_EMAIL}`);
    });
});

