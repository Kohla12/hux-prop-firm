/**
 * HUX PROP FIRM - SECURE REAL-TIME BACKEND ENGINE
 * Implements database-backed user authentication, password hashing,
 * JWT session management, Google/Apple OAuth, secure Stripe Hosted Checkout,
 * admin payment approval workflow, and trading platform account linking.
 */

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_keys');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

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
// JWT AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Verifies the Bearer JWT on protected routes.
 * Attaches decoded payload to req.user on success.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    }

    const token = authHeader.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, role }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

/**
 * Extends requireAuth — additionally enforces admin role.
 */
function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required.' });
        }
        next();
    });
}

// ============================================================================
// SHARED HELPER — upsert OAuth user
// ============================================================================

/**
 * Finds an existing user by OAuth subject or email, or creates a new one.
 * Returns the persisted user row.
 */
async function upsertOAuthUser({ email, firstName, lastName, provider, subject }) {
    // 1. Try to find by provider + subject (most reliable)
    let result = await pool.query(
        `SELECT id, email, role, status FROM users WHERE oauth_provider = $1 AND oauth_subject = $2`,
        [provider, subject]
    );

    if (result.rows.length > 0) {
        console.log(`[HUX Auth] OAuth sign-in: existing user ${result.rows[0].id} via ${provider}`);
        return result.rows[0];
    }

    // 2. Try to find by email — link OAuth to existing email/password account
    result = await pool.query(
        `SELECT id, email, role, status FROM users WHERE email = $1`,
        [email]
    );

    if (result.rows.length > 0) {
        const user = result.rows[0];
        // Attach OAuth credentials to the existing account
        await pool.query(
            `UPDATE users SET oauth_provider = $1, oauth_subject = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
            [provider, subject, user.id]
        );
        console.log(`[HUX Auth] OAuth linked to existing account ${user.id} via ${provider}`);
        return user;
    }

    // 3. Brand-new user — create and persist
    result = await pool.query(
        `INSERT INTO users (email, first_name, last_name, oauth_provider, oauth_subject, role, status)
         VALUES ($1, $2, $3, $4, $5, 'trader', 'active')
         RETURNING id, email, role, status`,
        [email, firstName || '', lastName || '', provider, subject]
    );

    const newUser = result.rows[0];
    console.log(`[HUX Auth] New OAuth user created: ${newUser.id} (${email}) via ${provider}`);
    return newUser;
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
             RETURNING id, email, role`,
            [email, passwordHash, firstName || '', lastName || '']
        );

        const newUser = result.rows[0];
        console.log(`[HUX Auth] New user registered: ${newUser.id} (${newUser.email})`);

        // Generate secure JWT token
        const token = jwt.sign({ userId: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(201).json({
            message: 'User registered successfully.',
            token,
            user: { id: newUser.id, email: newUser.email, role: newUser.role }
        });

    } catch (error) {
        console.error('[HUX Auth] Signup error:', error);
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
        // Fetch user from database
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'This profile is currently suspended.' });
        }

        // OAuth-only accounts have no password hash
        if (!user.password_hash) {
            return res.status(401).json({ error: 'This account uses social sign-in. Please use Google or Apple to log in.' });
        }

        // Compare password safely with bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        console.log(`[HUX Auth] User signed in: ${user.id} (${user.email})`);

        // Generate JWT token session
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: 'Authenticated successfully.',
            token,
            user: { id: user.id, email: user.email, role: user.role }
        });

    } catch (error) {
        console.error('[HUX Auth] Signin error:', error);
        return res.status(500).json({ error: 'Internal server login failure.' });
    }
});

// ============================================================================
// 3. GOOGLE OAUTH — POST /api/auth/google
// Accepts a Google ID token from the client (obtained via Google Sign-In SDK),
// verifies it server-side, then upserts the user and returns a JWT.
// ============================================================================
app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ error: 'Google ID token is required.' });
    }

    if (!GOOGLE_CLIENT_ID) {
        console.error('[HUX Auth] GOOGLE_CLIENT_ID environment variable is not set.');
        return res.status(500).json({ error: 'Google OAuth is not configured on this server.' });
    }

    try {
        // Verify the token with Google's public keys
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: subject, email, given_name: firstName, family_name: lastName, email_verified } = payload;

        if (!email_verified) {
            return res.status(401).json({ error: 'Google account email is not verified.' });
        }

        const user = await upsertOAuthUser({ email, firstName, lastName, provider: 'google', subject });

        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'This profile is currently suspended.' });
        }

        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: 'Google authentication successful.',
            token,
            user: { id: user.id, email: user.email, role: user.role }
        });

    } catch (error) {
        console.error('[HUX Auth] Google OAuth error:', error.message);
        return res.status(401).json({ error: 'Google token verification failed.' });
    }
});

// ============================================================================
// 4. APPLE OAUTH — POST /api/auth/apple
// Accepts an Apple identity token from the client (obtained via Sign in with
// Apple SDK), verifies it server-side, then upserts the user and returns a JWT.
// Apple only sends name/email on the very first sign-in; clients should pass
// them in the request body when available.
// ============================================================================
app.post('/api/auth/apple', async (req, res) => {
    const { identityToken, firstName, lastName } = req.body;

    if (!identityToken) {
        return res.status(400).json({ error: 'Apple identity token is required.' });
    }

    try {
        // Verify the token with Apple's public keys
        const applePayload = await appleSignin.verifyIdToken(identityToken, {
            audience: process.env.APPLE_CLIENT_ID,
            ignoreExpiration: false,
        });

        const { sub: subject, email } = applePayload;

        if (!email) {
            // Apple may omit email after the first sign-in; require it on first use
            return res.status(400).json({ error: 'Email not provided by Apple. Please re-authenticate.' });
        }

        const user = await upsertOAuthUser({ email, firstName, lastName, provider: 'apple', subject });

        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'This profile is currently suspended.' });
        }

        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            message: 'Apple authentication successful.',
            token,
            user: { id: user.id, email: user.email, role: user.role }
        });

    } catch (error) {
        console.error('[HUX Auth] Apple OAuth error:', error.message);
        return res.status(401).json({ error: 'Apple token verification failed.' });
    }
});

// ============================================================================
// 5. SECURE STRIPE CHECKOUT INTEGRATION (PCI-Compliant Payment Redirects)
// ============================================================================
app.post('/api/checkout/create-session', async (req, res) => {
    const { challengeType, size, price, email, successUrl, cancelUrl } = req.body;

    if (!challengeType || !size || !price || !email) {
        return res.status(400).json({ error: 'challengeType, size, price, and email are required.' });
    }

    try {
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
            metadata: { challengeType, size, email }
        });

        // Persist the pending payment record so it can be tracked and approved
        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        const userId = userRes.rows.length > 0 ? userRes.rows[0].id : null;

        await pool.query(
            `INSERT INTO payments (user_id, stripe_session_id, amount_cents, challenge_type, challenge_size, status, metadata)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
            [userId, session.id, Math.round(price * 100), challengeType, parseFloat(size), JSON.stringify({ email })]
        );

        console.log(`[HUX Checkout] Payment session created: ${session.id} for ${email}`);

        // Send payment redirect URL back to client
        return res.status(200).json({ url: session.url, sessionId: session.id });

    } catch (error) {
        console.error('[HUX Checkout] Stripe session error:', error);
        return res.status(500).json({ error: 'Unable to initiate Stripe payment checkout.' });
    }
});

// ============================================================================
// 6. STRIPE WEBHOOK — marks payment as paid and queues admin approval
// Account provisioning is intentionally deferred until an admin approves the
// payment via POST /api/admin/payments/:paymentId/approve.
// ============================================================================
app.post('/api/checkout/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Verify webhook signature to prevent spoofing attacks
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('[HUX Webhook] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        try {
            // 1. Mark the payment record as paid
            const paymentRes = await pool.query(
                `UPDATE payments
                 SET status = 'paid',
                     stripe_payment_intent = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE stripe_session_id = $2
                 RETURNING id, user_id`,
                [session.payment_intent, session.id]
            );

            let paymentId;

            if (paymentRes.rows.length > 0) {
                paymentId = paymentRes.rows[0].id;
            } else {
                // Webhook arrived before create-session response was stored (rare race);
                // insert a new payment record so nothing is lost.
                const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [session.metadata.email]);
                const userId = userRes.rows.length > 0 ? userRes.rows[0].id : null;

                const insertRes = await pool.query(
                    `INSERT INTO payments (user_id, stripe_session_id, stripe_payment_intent, amount_cents, challenge_type, challenge_size, status, metadata)
                     VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
                     RETURNING id`,
                    [
                        userId,
                        session.id,
                        session.payment_intent,
                        session.amount_total,
                        session.metadata.challengeType,
                        parseFloat(session.metadata.size),
                        JSON.stringify(session.metadata)
                    ]
                );
                paymentId = insertRes.rows[0].id;
            }

            // 2. Create a pending approval record for the admin queue
            await pool.query(
                `INSERT INTO payment_approvals (payment_id, status) VALUES ($1, 'pending')`,
                [paymentId]
            );

            console.log(`[HUX Webhook] Payment ${paymentId} confirmed by Stripe — queued for admin approval`);

        } catch (dbErr) {
            console.error('[HUX Webhook] Database error processing payment:', dbErr);
            return res.status(500).send('Internal database webhook error');
        }
    }

    return res.status(200).json({ received: true });
});

// ============================================================================
// 7. USER PROFILE — GET /api/user/profile
// ============================================================================
app.get('/api/user/profile', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, first_name, last_name, role, status, kyc_status, oauth_provider, created_at
             FROM users WHERE id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        return res.status(200).json({ user: result.rows[0] });
    } catch (error) {
        console.error('[HUX Profile] Error fetching profile:', error);
        return res.status(500).json({ error: 'Failed to retrieve user profile.' });
    }
});

// ============================================================================
// 8. USER TRADING ACCOUNTS — GET /api/user/trading-accounts
// ============================================================================
app.get('/api/user/trading-accounts', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ta.id, ta.broker_platform, ta.login_id, ta.server_address,
                    ta.balance, ta.equity, ta.start_balance, ta.status,
                    ta.consistency_score, ta.active_trading_days, ta.min_trading_days,
                    ta.created_at,
                    c.type AS challenge_type, c.size AS challenge_size,
                    c.profit_target, c.daily_drawdown_limit, c.max_drawdown_limit
             FROM trading_accounts ta
             LEFT JOIN challenges c ON ta.challenge_id = c.id
             WHERE ta.user_id = $1
             ORDER BY ta.created_at DESC`,
            [req.user.userId]
        );

        return res.status(200).json({ accounts: result.rows });
    } catch (error) {
        console.error('[HUX Accounts] Error fetching trading accounts:', error);
        return res.status(500).json({ error: 'Failed to retrieve trading accounts.' });
    }
});

// ============================================================================
// 9. TRADING PLATFORM LINKING — POST /api/user/trading-accounts/:accountId/link
// Allows a user to link their funded account to a specific trading platform
// (MT4, MT5, cTrader, Match Trader, DXTrade) and update the server address.
// ============================================================================
app.post('/api/user/trading-accounts/:accountId/link', requireAuth, async (req, res) => {
    const { accountId } = req.params;
    const { platform, serverAddress, loginId } = req.body;

    const VALID_PLATFORMS = ['mt4', 'mt5', 'ctrader', 'match_trader', 'dxtrade'];

    if (!platform || !VALID_PLATFORMS.includes(platform.toLowerCase())) {
        return res.status(400).json({
            error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}.`
        });
    }

    if (!serverAddress) {
        return res.status(400).json({ error: 'serverAddress is required.' });
    }

    try {
        // Verify the account belongs to the authenticated user
        const accountRes = await pool.query(
            `SELECT id, status FROM trading_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, req.user.userId]
        );

        if (accountRes.rows.length === 0) {
            return res.status(404).json({ error: 'Trading account not found.' });
        }

        if (accountRes.rows[0].status === 'breached') {
            return res.status(400).json({ error: 'Cannot link a breached account to a trading platform.' });
        }

        let query, params;
        if (loginId) {
            query = `UPDATE trading_accounts
                     SET broker_platform = $1, server_address = $2, login_id = $3, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $4 AND user_id = $5
                     RETURNING id, broker_platform, server_address, login_id, status`;
            params = [platform.toLowerCase(), serverAddress, loginId, accountId, req.user.userId];
        } else {
            query = `UPDATE trading_accounts
                     SET broker_platform = $1, server_address = $2, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $3 AND user_id = $4
                     RETURNING id, broker_platform, server_address, login_id, status`;
            params = [platform.toLowerCase(), serverAddress, accountId, req.user.userId];
        }

        const result = await pool.query(query, params);
        const updated = result.rows[0];

        console.log(`[HUX Platform Link] Account ${accountId} linked to ${platform} by user ${req.user.userId}`);

        return res.status(200).json({
            message: `Account successfully linked to ${platform.toUpperCase()}.`,
            account: updated
        });

    } catch (error) {
        console.error('[HUX Platform Link] Error linking trading platform:', error);
        return res.status(500).json({ error: 'Failed to link trading platform.' });
    }
});

// ============================================================================
// 10. ADMIN — LIST PAYMENT APPROVALS
//     GET /api/admin/payments?status=pending
// ============================================================================
app.get('/api/admin/payments', requireAdmin, async (req, res) => {
    const { status = 'pending' } = req.query;

    const VALID_STATUSES = ['pending', 'approved', 'rejected'];
    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
    }

    try {
        const result = await pool.query(
            `SELECT pa.id AS approval_id, pa.status AS approval_status, pa.admin_notes, pa.reviewed_at, pa.created_at,
                    p.id AS payment_id, p.stripe_session_id, p.stripe_payment_intent,
                    p.amount_cents, p.currency, p.challenge_type, p.challenge_size, p.status AS payment_status,
                    u.id AS user_id, u.email, u.first_name, u.last_name
             FROM payment_approvals pa
             JOIN payments p ON pa.payment_id = p.id
             LEFT JOIN users u ON p.user_id = u.id
             WHERE pa.status = $1
             ORDER BY pa.created_at DESC`,
            [status]
        );

        return res.status(200).json({ approvals: result.rows });
    } catch (error) {
        console.error('[HUX Admin] Error fetching payment approvals:', error);
        return res.status(500).json({ error: 'Failed to retrieve payment approvals.' });
    }
});

// ============================================================================
// 11. ADMIN — APPROVE A PAYMENT
//     POST /api/admin/payments/:paymentId/approve
// Triggers immediate trading account provisioning.
// ============================================================================
async function provisionTradingAccount(userId, challengeType, challengeSize, amountCents) {
    const normalizedType = challengeType === '1-step' ? 'one_step' : 'two_step';
    const size = parseFloat(challengeSize);

    const challengeRes = await pool.query(
        `INSERT INTO challenges (user_id, type, size, profit_target, daily_drawdown_limit, max_drawdown_limit, fee, purchase_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'paid')
         RETURNING id`,
        [userId, normalizedType, size, size * 0.08, size * 0.05, size * 0.10, amountCents / 100]
    );

    const challengeId = challengeRes.rows[0].id;
    const loginId = Math.floor(Math.random() * 9000000 + 1000000).toString();

    const accountRes = await pool.query(
        `INSERT INTO trading_accounts (user_id, challenge_id, login_id, server_address, balance, equity, start_balance, daily_base_balance)
         VALUES ($1, $2, $3, 'Hux-Broker-Server-01', $4, $4, $4, $4)
         RETURNING id, login_id`,
        [userId, challengeId, loginId, size]
    );

    return { challengeId, accountId: accountRes.rows[0].id, loginId };
}

app.post('/api/admin/payments/:paymentId/approve', requireAdmin, async (req, res) => {
    const { paymentId } = req.params;
    const { notes } = req.body;

    try {
        const paymentRes = await pool.query(
            `SELECT p.*, pa.id AS approval_id, pa.status AS approval_status
             FROM payments p
             JOIN payment_approvals pa ON pa.payment_id = p.id
             WHERE p.id = $1`,
            [paymentId]
        );

        if (paymentRes.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found.' });
        }

        const payment = paymentRes.rows[0];

        if (payment.approval_status === 'approved') {
            return res.status(409).json({ error: 'Payment has already been approved.' });
        }

        if (payment.status !== 'paid') {
            return res.status(400).json({ error: 'Cannot approve a payment that has not been confirmed by Stripe.' });
        }

        if (!payment.user_id) {
            return res.status(400).json({ error: 'No user associated with this payment. Cannot provision account.' });
        }

        const provisioned = await provisionTradingAccount(
            payment.user_id,
            payment.challenge_type,
            payment.challenge_size,
            payment.amount_cents
        );

        await pool.query(
            `UPDATE payment_approvals
             SET status = 'approved', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [req.user.userId, notes || null, payment.approval_id]
        );

        console.log(`[HUX Admin] Payment ${paymentId} approved by admin ${req.user.userId} — account ${provisioned.loginId} provisioned`);

        return res.status(200).json({
            message: 'Payment approved and trading account provisioned.',
            challengeId: provisioned.challengeId,
            accountId: provisioned.accountId,
            loginId: provisioned.loginId
        });

    } catch (error) {
        console.error('[HUX Admin] Error approving payment:', error);
        return res.status(500).json({ error: 'Failed to approve payment.' });
    }
});

// ============================================================================
// 12. ADMIN — REJECT A PAYMENT
//     POST /api/admin/payments/:paymentId/reject
// ============================================================================
app.post('/api/admin/payments/:paymentId/reject', requireAdmin, async (req, res) => {
    const { paymentId } = req.params;
    const { notes } = req.body;

    try {
        const approvalRes = await pool.query(
            `SELECT pa.id, pa.status FROM payment_approvals pa
             JOIN payments p ON pa.payment_id = p.id
             WHERE p.id = $1`,
            [paymentId]
        );

        if (approvalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found.' });
        }

        const approval = approvalRes.rows[0];

        if (approval.status === 'approved') {
            return res.status(409).json({ error: 'Cannot reject an already-approved payment.' });
        }

        await pool.query(
            `UPDATE payment_approvals
             SET status = 'rejected', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [req.user.userId, notes || null, approval.id]
        );

        console.log(`[HUX Admin] Payment ${paymentId} rejected by admin ${req.user.userId}`);

        return res.status(200).json({ message: 'Payment rejected.' });

    } catch (error) {
        console.error('[HUX Admin] Error rejecting payment:', error);
        return res.status(500).json({ error: 'Failed to reject payment.' });
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
    });
});
