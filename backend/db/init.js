/**
 * Database Initialization Script
 * Runs the schema.sql to set up the PostgreSQL database
 * This script is called on application startup to ensure the database is ready
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://hux_admin:HUX_secure_db_pass_2026@localhost:5432/hux_prop_firm',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
    try {
        console.log('[DB Init] Connecting to PostgreSQL...');
        
        // Test connection
        const client = await pool.connect();
        console.log('[DB Init] ✓ Connected to PostgreSQL');
        
        // Read schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute schema
        console.log('[DB Init] Executing schema...');
        await client.query(schema);
        console.log('[DB Init] ✓ Database schema initialized successfully');
        
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

