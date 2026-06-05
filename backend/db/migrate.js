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
            console.log('[DB Migration] ✓ Database schema already exists');
        }
        
        client.release();
    } catch (error) {
        console.error('[DB Migration] Error:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

module.exports = { ensureDatabaseSchema };

