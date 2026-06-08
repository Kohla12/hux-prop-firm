/**
 * Database Initialization Script
 * Runs the schema.sql to set up the PostgreSQL database
 * This script is called on application startup to ensure the database is ready
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
    console.error('[DB Init] ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
    try {
        console.log('[DB Init] Connecting to Neon PostgreSQL...');
        
        // Test connection
        const client = await pool.connect();
        console.log('[DB Init] ✓ Connected to Neon database');
        
        // Verify schema exists by checking for users table
        const result = await client.query(
            `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'users')`
        );
        
        if (result.rows[0].exists) {
            console.log('[DB Init] ✓ Database schema already initialized');
        } else {
            console.log('[DB Init] ⚠ Schema not found. Please run the migration script first.');
        }
        
        client.release();
        await pool.end();
        
        process.exit(0);
    } catch (error) {
        console.error('[DB Init] Error initializing database:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };

