const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL Connection Pool setup
// .env file ya environment variable se connection string uthayega
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/nexus_db'
});

async function setupDatabase() {
    // PostgreSQL tables with SERIAL primary key and created_at timestamp
    await pool.query(`
        CREATE TABLE IF NOT EXISTS server_logs (
            id SERIAL PRIMARY KEY,
            region VARCHAR(50),
            cpu_usage INTEGER,
            ram_usage INTEGER,
            status VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_insights (
            id SERIAL PRIMARY KEY,
            log_id INTEGER REFERENCES server_logs(id) ON DELETE CASCADE,
            insight_text TEXT,
            confidence_score INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("📦 PostgreSQL Database initialized successfully with timestamp tracking.");

    // Wrapper object taaki server.js ke purane .run(), .get(), .all() methods bina error ke chalein
    return {
        async run(query, params = []) {
            // SQLite ke '?' ko PostgreSQL ke '$1, $2...' mein convert karne ka logic
            let i = 0;
            const pgQuery = query.replace(/\?/g, () => `$${++i}`);
            
            // Agar INSERT query hai toh last inserted ID (lastID) return karne ke liye 'RETURNING id' add kar rahe hain
            if (pgQuery.trim().toUpperCase().startsWith('INSERT') && !pgQuery.includes('RETURNING')) {
                const modifiedQuery = pgQuery + ' RETURNING id';
                const res = await pool.query(modifiedQuery, params);
                return { lastID: res.rows[0]?.id };
            }
            
            const res = await pool.query(pgQuery, params);
            return { rowCount: res.rowCount };
        },
        async get(query, params = []) {
            let i = 0;
            const pgQuery = query.replace(/\?/g, () => `$${++i}`);
            const res = await pool.query(pgQuery, params);
            return res.rows[0];
        },
        async all(query, params = []) {
            let i = 0;
            const pgQuery = query.replace(/\?/g, () => `$${++i}`);
            const res = await pool.query(pgQuery, params);
            return res.rows;
        }
    };
}

module.exports = setupDatabase;