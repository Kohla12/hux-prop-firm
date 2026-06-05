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
             RETURNING id, email, role, first_name, last_name, created_at`,
            [email, passwordHash, firstName || '', lastName || '']
        );

        const newUser = result.rows[0];
        console.log(`[Auth] User registered: ${newUser.email} (ID: ${newUser.id})`);

        // Generate secure JWT token
        const token = jwt.sign({ userId: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(201).json({
            message: 'User registered successfully.',
            token,
            user: { 
                id: newUser.id, 
                email: newUser.email, 
                role: newUser.role,
                firstName: newUser.first_name,
                lastName: newUser.last_name,
                createdAt: newUser.created_at
            }
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

        console.log(`[Auth] User logged in: ${user.email} (ID: ${user.id})`);

        return res.status(200).json({
            message: 'Authenticated successfully.',
            token,
            user: { 
                id: user.id, 
                email: user.email, 
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error) {
        console.error('Signin Error:', error);
        return res.status(500).json({ error: 'Internal server login failure.' });
    }
});

// ============================================================================
// 3. OAUTH: GOOGLE AUTHENTICATION
// ============================================================================
app.post('/api/auth/google', async (req, res) => {
    const { googleToken, email, firstName, lastName, googleId } = req.body;

    if (!email || !googleId) {
        return res.status(400).json({ error: 'Email and Google ID are required.' });
    }

    try {
        // Check if user exists
        let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            // Create new user from Google OAuth
            const result = await pool.query(
                `INSERT INTO users (email, first_name, last_name, role, status, oauth_provider, oauth_id) 
                 VALUES ($1, $2, $3, 'trader', 'active', 'google', $4) 
                 RETURNING id, email, role, first_name, last_name`,
                [email, firstName || '', lastName || '', googleId]
            );
            user = result;
            console.log(`[OAuth] New Google user created: ${email}`);
        } else {
            // Update existing user with Google OAuth if not already linked
            if (!user.rows[0].oauth_id) {
                await pool.query(
                    `UPDATE users SET oauth_provider = 'google', oauth_id = $1 WHERE id = $2`,
                    [googleId, user.rows[0].id]
                );
                console.log(`[OAuth] Google OAuth linked to existing user: ${email}`);
            }
        }

        const userData = user.rows[0];
        const token = jwt.sign({ userId: userData.id, role: userData.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: 'Google authentication successful.',
            token,
            user: {
                id: userData.id,
                email: userData.email,
                role: userData.role,
                firstName: userData.first_name,
                lastName: userData.last_name
            }
        });

    } catch (error) {
        console.error('Google OAuth Error:', error);
        return res.status(500).json({ error: 'Google authentication failed.' });
    }
});

// ============================================================================
// 4. OAUTH: APPLE AUTHENTICATION
// ============================================================================
app.post('/api/auth/apple', async (req, res) => {
    const { appleToken, email, firstName, lastName, appleId } = req.body;

    if (!email || !appleId) {
        return res.status(400).json({ error: 'Email and Apple ID are required.' });
    }

    try {
        // Check if user exists
        let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            // Create new user from Apple OAuth
            const result = await pool.query(
                `INSERT INTO users (email, first_name, last_name, role, status, oauth_provider, oauth_id) 
                 VALUES ($1, $2, $3, 'trader', 'active', 'apple', $4) 
                 RETURNING id, email, role, first_name, last_name`,
                [email, firstName || '', lastName || '', appleId]
            );
            user = result;
            console.log(`[OAuth] New Apple user created: ${email}`);
        } else {
            // Update existing user with Apple OAuth if not already linked
            if (!user.rows[0].oauth_id) {
                await pool.query(
                    `UPDATE users SET oauth_provider = 'apple', oauth_id = $1 WHERE id = $2`,
                    [appleId, user.rows[0].id]
                );
                console.log(`[OAuth] Apple OAuth linked to existing user: ${email}`);
            }
        }

        const userData = user.rows[0];
        const token = jwt.sign({ userId: userData.id, role: userData.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: 'Apple authentication successful.',
            token,
            user: {
                id: userData.id,
                email: userData.email,
                role: userData.role,
                firstName: userData.first_name,
                lastName: userData.last_name
            }
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

        const email = userResult.rows[0].email;

        // Create secure hosted checkout session on Stripe's PCI-compliant server
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email,
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
                email
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

        try {
            // Update payment status to completed
            await pool.query(
                `UPDATE payments SET status = 'completed', completed_at = NOW() 
                 WHERE stripe_session_id = $1`,
                [session.id]
            );

            // Get user and payment details
            const paymentResult = await pool.query(
                `SELECT user_id, challenge_type, challenge_size FROM payments WHERE stripe_session_id = $1`,
                [session.id]
            );

            if (paymentResult.rows.length > 0) {
                const { user_id, challenge_type, challenge_size } = paymentResult.rows[0];

                // Create challenge entry
                const challengeRes = await pool.query(
                    `INSERT INTO challenges (user_id, type, size, profit_target, daily_drawdown_limit, max_drawdown_limit, fee, purchase_status) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_admin_approval') 
                     RETURNING id`,
                    [
                        user_id,
                        challenge_type === '1-step' ? 'one_step' : 'two_step',
                        parseFloat(challenge_size),
                        parseFloat(challenge_size) * 0.08, // Target: 8%
                        parseFloat(challenge_size) * 0.05, // Daily limit: 5%
                        parseFloat(challenge_size) * 0.10, // Max limit: 10%
                        session.amount_total / 100
                    ]
                );

                // Create admin notification for payment confirmation
                await pool.query(
                    `INSERT INTO admin_notifications (type, user_id, challenge_id, message, status) 
                     VALUES ('payment_confirmation', $1, $2, $3, 'pending')`,
                    [user_id, challengeRes.rows[0].id, `Payment received for ${challenge_size} ${challenge_type} challenge. Awaiting admin approval.`]
                );

                console.log(`[Payment] Payment confirmed for user ${user_id}. Awaiting admin approval.`);
            }
        } catch (dbErr) {
            console.error('Database Webhook processing error:', dbErr);
            return res.status(500).send('Internal Database Webhook error');
        }
    }

    return res.status(200).json({ received: true });
});

// ============================================================================
// 7. ADMIN: APPROVE PAYMENT & PROVISION ACCOUNT
// ============================================================================
app.post('/api/admin/approve-payment/:challengeId', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }

    const { challengeId } = req.params;

    try {
        // Get challenge details
        const challengeResult = await pool.query(
            `SELECT user_id, size FROM challenges WHERE id = $1`,
            [challengeId]
        );

        if (challengeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Challenge not found.' });
        }

        const { user_id, size } = challengeResult.rows[0];

        // Update challenge status to approved
        await pool.query(
            `UPDATE challenges SET purchase_status = 'paid' WHERE id = $1`,
            [challengeId]
        );

        // Provision trading account
        const randomLogin = Math.floor(Math.random() * 9000000 + 1000000).toString();
        await pool.query(
            `INSERT INTO trading_accounts (user_id, challenge_id, login_id, server_address, balance, equity, start_balance, daily_base_balance) 
             VALUES ($1, $2, $3, 'Hux-Broker-Server-01', $4, $4, $4, $4)`,
            [user_id, challengeId, randomLogin, size]
        );

        // Update admin notification
        await pool.query(
            `UPDATE admin_notifications SET status = 'approved' WHERE challenge_id = $1`,
            [challengeId]
        );

        console.log(`[Admin] Payment approved for challenge ${challengeId}. Account ${randomLogin} provisioned.`);

        return res.status(200).json({
            message: 'Payment approved and account provisioned.',
            tradingAccount: {
                loginId: randomLogin,
                balance: size,
                serverAddress: 'Hux-Broker-Server-01'
            }
        });

    } catch (error) {
        console.error('Admin Approval Error:', error);
        return res.status(500).json({ error: 'Failed to approve payment.' });
    }
});

// ============================================================================
// 8. LINK TRADING PLATFORM
// ============================================================================
app.post('/api/trading/link-platform', verifyToken, async (req, res) => {
    const { tradingAccountId, platformType, platformLogin, platformPassword, platformServer } = req.body;
    const userId = req.userId;

    if (!tradingAccountId || !platformType || !platformLogin) {
        return res.status(400).json({ error: 'Trading account ID, platform type, and login are required.' });
    }

    try {
        // Verify trading account belongs to user
        const accountResult = await pool.query(
            `SELECT id FROM trading_accounts WHERE id = $1 AND user_id = $2`,
            [tradingAccountId, userId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Trading account not found or does not belong to you.' });
        }

        // Create platform link
        const result = await pool.query(
            `INSERT INTO platform_links (trading_account_id, platform_type, platform_login, platform_server, status) 
             VALUES ($1, $2, $3, $4, 'active') 
             RETURNING id, platform_type, status, created_at`,
            [tradingAccountId, platformType, platformLogin, platformServer || null]
        );

        const link = result.rows[0];
        console.log(`[Trading] Platform linked: ${platformType} for account ${tradingAccountId}`);

        return res.status(201).json({
            message: 'Trading platform linked successfully.',
            platformLink: {
                id: link.id,
                platformType: link.platform_type,
                status: link.status,
                linkedAt: link.created_at
            }
        });

    } catch (error) {
        console.error('Platform Link Error:', error);
        return res.status(500).json({ error: 'Failed to link trading platform.' });
    }
});

// ============================================================================
// 9. GET USER TRADING ACCOUNTS & PLATFORMS
// ============================================================================
app.get('/api/trading/accounts', verifyToken, async (req, res) => {
    const userId = req.userId;

    try {
        const result = await pool.query(
            `SELECT ta.id, ta.login_id, ta.balance, ta.equity, ta.status, ta.created_at,
                    pl.id as platform_id, pl.platform_type, pl.status as platform_status
             FROM trading_accounts ta
             LEFT JOIN platform_links pl ON ta.id = pl.trading_account_id
             WHERE ta.user_id = $1
             ORDER BY ta.created_at DESC`,
            [userId]
        );

        const accounts = {};
        result.rows.forEach(row => {
            if (!accounts[row.id]) {
                accounts[row.id] = {
                    id: row.id,
                    loginId: row.login_id,
                    balance: row.balance,
                    equity: row.equity,
                    status: row.status,
                    createdAt: row.created_at,
                    platforms: []
                };
            }
            if (row.platform_id) {
                accounts[row.id].platforms.push({
                    id: row.platform_id,
                    type: row.platform_type,
                    status: row.platform_status
                });
            }
        });

        return res.status(200).json({
            accounts: Object.values(accounts)
        });

    } catch (error) {
        console.error('Get Accounts Error:', error);
        return res.status(500).json({ error: 'Failed to retrieve trading accounts.' });
    }
});

// ============================================================================
// 10. HEALTH CHECK ENDPOINT
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
    });
});

