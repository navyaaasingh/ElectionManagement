const pg = require('pg');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Pool } = pg;
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Database connection configuration
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'election_db',
    user: process.env.POSTGRES_USER || 'election_admin',
    password: process.env.POSTGRES_PASSWORD || 'changeme_secure_password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const isTruthy = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const checksum = (sql) => crypto.createHash('sha256').update(sql).digest('hex');

const ensureMigrationTable = async (client) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id BIGSERIAL PRIMARY KEY,
            migration_name VARCHAR(255) NOT NULL UNIQUE,
            checksum VARCHAR(64),
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
};

const runLegacySchemaReset = async (client) => {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    await client.query(schema);
};

const runSqlMigration = async (client, migrationName, sql) => {
    const sqlHash = checksum(sql);

    const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE migration_name = $1 LIMIT 1',
        [migrationName]
    );

    if (existing.rowCount > 0) {
        const previousChecksum = existing.rows[0].checksum;
        if (previousChecksum && previousChecksum !== sqlHash) {
            console.warn(`⚠️  Migration file changed after execution: ${migrationName}`);
        }
        return false;
    }

    await client.query('BEGIN');
    try {
        await client.query(sql);
        await client.query(
            'INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2)',
            [migrationName, sqlHash]
        );
        await client.query('COMMIT');
        console.log(`✅ Applied migration: ${migrationName}`);
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed (${migrationName}): ${error.message}`);
    }
};

const runVersionedMigrations = async (client) => {
    let files = [];
    try {
        files = await fs.readdir(MIGRATIONS_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn('⚠️  No migrations directory found, skipping versioned migrations.');
            return [];
        }
        throw error;
    }

    const sqlFiles = files
        .filter((file) => file.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b));

    const applied = [];
    for (const fileName of sqlFiles) {
        const filePath = path.join(MIGRATIONS_DIR, fileName);
        const sql = await fs.readFile(filePath, 'utf8');
        const didApply = await runSqlMigration(client, fileName, sql);
        if (didApply) applied.push(fileName);
    }

    return applied;
};

async function runMigration(options = {}) {
    const client = await pool.connect();
    const resetSchema = Boolean(options.resetSchema);

    try {
        console.log('🗄️  Starting database migration...');

        if (resetSchema) {
            console.warn('⚠️  Running legacy reset migration via schema.sql (destructive).');
            await runLegacySchemaReset(client);
        }

        await ensureMigrationTable(client);
        const appliedMigrations = await runVersionedMigrations(client);

        console.log('✅ Database migration completed successfully!');
        if (appliedMigrations.length === 0) {
            console.log('ℹ️  No new migrations were applied.');
        } else {
            console.log('Applied migrations:');
            appliedMigrations.forEach((name) => console.log(`  - ${name}`));
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration if called directly
if (require.main === module) {
    const resetSchema = process.argv.includes('--reset') || isTruthy(process.env.DB_MIGRATE_RESET, false);
    runMigration({ resetSchema }).catch(console.error);
}

module.exports = runMigration;
