/**
 * HUX PROP FIRM - SECURE REAL-TIME BACKEND ENGINE
 * Implements database-backed user authentication, password hashing,
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

// Validate required environment variables
if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
}

// Configure PostgreSQL Connection Pool for Neon
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Add error handler for pool
pool.on('error', (err) => {
    console.error('[DB Pool Error]', err);
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('ERROR: JWT_SECRET environment variable is required');
    process.exit(1);
}
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
// 3. SECURE STRIPE CHECKOUT INTEGRATION (PCI-Compliant Payment Redirects)
// ============================================================================
app.post('/api/checkout/create-session', async (req, res) => {
    const { challengeType, size, price, email, successUrl, cancelUrl } = req.body;

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
            metadata: {
                challengeType,
                size,
                email
            }
        });

        // Send payment redirect URL back to client
        return res.status(200).json({ url: session.url });

    } catch (error) {
        console.error('Stripe Session Error:', error);
        return res.status(500).json({ error: 'Unable to initiate Stripe payment checkout.' });
    }
});

// ============================================================================
// 4. STRIPE WEBHOOK (Listening for confirmed payments to provision accounts)
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

        // Provision active prop trading challenge account for the user in the database
        try {
            const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [session.metadata.email]);
            if (userRes.rows.length > 0) {
                const userId = userRes.rows[0].id;
                
                // 1. Create Challenge entry
                const challengeRes = await pool.query(
                    `INSERT INTO challenges (user_id, type, size, profit_target, daily_drawdown_limit, max_drawdown_limit, fee) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                    [
                        userId, 
                        session.metadata.challengeType === '1-step' ? 'one_step' : 'two_step', 
                        parseFloat(session.metadata.size),
                        parseFloat(session.metadata.size) * 0.08, // Target: 8%
                        parseFloat(session.metadata.size) * 0.05, // Daily limit: 5%
                        parseFloat(session.metadata.size) * 0.10, // Max limit: 10%
                        session.amount_total / 100
                    ]
                );

                // 2. Provision Trading Account Bridge
                const randomLogin = Math.floor(Math.random() * 9000000 + 1000000).toString();
                await pool.query(
                    `INSERT INTO trading_accounts (user_id, challenge_id, login_id, server_address, balance, equity, start_balance, daily_base_balance) 
                     VALUES ($1, $2, $3, 'Hux-Broker-Server-01', $4, $4, $4, $4)`,
                    [userId, challengeRes.rows[0].id, randomLogin, parseFloat(session.metadata.size)]
                );

                console.log(`[HUX Real-time Bridge] Successfully provisioned account ${randomLogin} for user ${session.metadata.email}`);
            }
        } catch (dbErr) {
            console.error('Database Webhook processing error:', dbErr);
            return res.status(500).send('Internal Database Webhook error');
        }
    }

    return res.status(200).json({ received: true });
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
        console.log(`[HUX Backend Engine] Database: Neon PostgreSQL (Production Ready)`);
    });
});

