/**
 * Database Migration Helper
 * Ensures database schema exists on application startup
 * Runs silently if schema already exists (idempotent)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function ensureDatabaseSchema() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://hux_admin:HUX_secure_db_pass_2026@localhost:5432/hux_prop_firm',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        const client = await pool.connect();
        
        // Check if users table exists
        const result = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            )`
        );
        
        if (!result.rows[0].exists) {
            console.log('[DB Migration] Creating database schema...');
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await client.query(schema);
            console.log('[DB Migration] ✓ Database schema created');
        } else {
            console.log('[DB Migration] ✓ Database schema already exists — running additive migrations...');
            await runAdditiveMigrations(client);
        }
        
        client.release();
    } catch (error) {
        console.error('[DB Migration] Error:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

/**
 * Additive migrations — safe to run on every startup.
 * Each statement uses IF NOT EXISTS / DO blocks so they are idempotent.
 */
async function runAdditiveMigrations(client) {
    const migrations = [
        // Make password_hash nullable for OAuth users
        `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,

        // OAuth columns on users
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_subject VARCHAR(255)`,

        // New ENUM types (guard with DO blocks to avoid duplicate-type errors)
        `DO $ BEGIN
            CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
         EXCEPTION WHEN duplicate_object THEN NULL; END $`,

        `DO $ BEGIN
            CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
         EXCEPTION WHEN duplicate_object THEN NULL; END $`,

        // payments table
        `CREATE TABLE IF NOT EXISTS payments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
            stripe_payment_intent VARCHAR(255),
            amount_cents INTEGER NOT NULL,
            currency VARCHAR(10) DEFAULT 'usd',
            challenge_type VARCHAR(50),
            challenge_size DECIMAL(12, 2),
            status payment_status DEFAULT 'pending'::payment_status,
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`,

        // payment_approvals table
        `CREATE TABLE IF NOT EXISTS payment_approvals (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
            admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
            status approval_status DEFAULT 'pending'::approval_status,
            admin_notes TEXT,
            reviewed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`,

        // New indexes (IF NOT EXISTS requires PG 9.5+)
        `CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_subject)`,
        `CREATE INDEX IF NOT EXISTS idx_accounts_user ON trading_accounts(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`,
        `CREATE INDEX IF NOT EXISTS idx_payments_stripe_session ON payments(stripe_session_id)`,
        `CREATE INDEX IF NOT EXISTS idx_payment_approvals_payment ON payment_approvals(payment_id)`,
        `CREATE INDEX IF NOT EXISTS idx_payment_approvals_status ON payment_approvals(status)`,
    ];

    for (const sql of migrations) {
        try {
            await client.query(sql);
        } catch (err) {
            // Log but do not abort — some statements may fail on older schemas
            console.warn(`[DB Migration] Non-fatal migration warning: ${err.message}`);
        }
    }

    console.log('[DB Migration] ✓ Additive migrations complete');
}

module.exports = { ensureDatabaseSchema };

