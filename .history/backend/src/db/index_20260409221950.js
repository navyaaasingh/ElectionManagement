const { Sequelize } = require('sequelize');
const pg = require('pg');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const dotenv = require('dotenv');
const { CONTEXT_SCHEMAS } = require('../contexts/context.config.js');

dotenv.config({ path: require('path').resolve(__dirname, '../../../.env') });

// PostgreSQL Connection with Sequelize (ORM)
let sequelizeOptions = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    dialect: 'postgres',
    dialectModule: pg,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
        max: 20,
        min: 5,
        acquire: 30000,
        idle: 10000,
    },
    define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true,
    },
};

// Use SQLite as fallback for development if Postgres is not available
if (process.env.NODE_ENV === 'development' && (!process.env.POSTGRES_HOST || process.env.USE_SQLITE === 'true')) {
    console.log('⚠️  Using SQLite for development...');
    sequelizeOptions = {
        dialect: 'sqlite',
        storage: './election_db.sqlite',
        logging: console.log,
        define: {
            timestamps: true,
            underscored: true,
            freezeTableName: true,
        },
    };
}

const sequelize = new Sequelize(
    process.env.POSTGRES_DB || 'election_db',
    process.env.POSTGRES_USER || 'election_admin',
    process.env.POSTGRES_PASSWORD || 'changeme_secure_password',
    sequelizeOptions
);

// MongoDB Connection with Mongoose
const mongoURI = process.env.MONGODB_URI || `mongodb://${process.env.MONGODB_USER || 'mongo_admin'}:${process.env.MONGODB_PASSWORD || 'changeme_mongo_password'}@${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || 27017}/${process.env.MONGODB_DB || 'election_logs'}?authSource=admin`;

mongoose.set('strictQuery', false);

const connectMongoDB = async () => {
    try {
        await mongoose.connect(mongoURI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        throw error;
    }
};

// Redis Connection for Caching
const redisClient = createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        connectTimeout: 2000,
    },
    password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => {
    if (process.env.NODE_ENV !== 'development') {
        console.error('Redis Client Error:', err);
    }
});
redisClient.on('connect', () => console.log('✅ Redis connected successfully'));

const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        if (process.env.NODE_ENV !== 'development') {
            console.error('❌ Redis connection error:', error.message);
            throw error;
        } else {
            console.warn('⚠️  Redis connection failed (optional in development)');
        }
    }
};

const ensureSchemaCompatibility = async () => {
    const qi = sequelize.getQueryInterface();
    const dialect = sequelize.getDialect();

    const ensureColumn = async (tableName, columnName, definition) => {
        const table = await qi.describeTable(tableName);
        if (!table[columnName]) {
            await qi.addColumn(tableName, columnName, definition);
            console.log(`✅ Added missing column ${tableName}.${columnName}`);
        }
    };

    try {
        await qi.describeTable('admin_users');
    } catch {
        await qi.createTable('admin_users', {
            admin_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4,
            },
            username: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            email: {
                type: Sequelize.STRING(255),
                allowNull: false,
                unique: true,
            },
            password_hash: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            role: {
                type: Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'ELECTION_OFFICER',
            },
            district_id: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            last_login: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        console.log('✅ Created missing table admin_users');
    }

    await ensureColumn('students', 'admin_id', {
        type: Sequelize.UUID,
        allowNull: true,
    });
    await ensureColumn('voters', 'admin_id', {
        type: Sequelize.UUID,
        allowNull: true,
    });
    await ensureColumn('elections', 'created_by_admin_id', {
        type: Sequelize.UUID,
        allowNull: true,
    });
    await ensureColumn('voting_records', 'biometric_hash_salted', {
        type: Sequelize.STRING(64),
        allowNull: true,
    });
    await ensureColumn('voting_records', 'candidate_id', {
        type: Sequelize.UUID,
        allowNull: true,
    });
    await ensureColumn('voting_records', 'request_nonce', {
        type: Sequelize.STRING(128),
        allowNull: true,
    });
    await ensureColumn('voting_records', 'ranking_payload', {
        type: Sequelize.JSON,
        allowNull: true,
    });
    await ensureColumn('elections', 'eligibility_rules', {
        type: Sequelize.JSON,
        allowNull: true,
    });
    await ensureColumn('elections', 'runoff_config', {
        type: Sequelize.JSON,
        allowNull: true,
    });
    await ensureColumn('voters', 'date_of_birth', {
        type: Sequelize.DATEONLY,
        allowNull: true,
    });
    await ensureColumn('voters', 'party_affiliation', {
        type: Sequelize.STRING(100),
        allowNull: true,
    });
    await ensureColumn('voters', 'state', {
        type: Sequelize.STRING(100),
        allowNull: true,
    });
    await ensureColumn('voters', 'location_meta', {
        type: Sequelize.JSON,
        allowNull: true,
    });
    await ensureColumn('candidates', 'runoff_status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
    });

    try {
        await qi.describeTable('vote_nonces');
    } catch {
        await qi.createTable('vote_nonces', {
            nonce_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4,
            },
            voter_id: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            election_id: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            nonce: {
                type: Sequelize.STRING(128),
                allowNull: false,
            },
            used_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        console.log('✅ Created missing table vote_nonces');
    }

    const addIndexIfMissing = async (table, fields, options = {}) => {
        const indexName = options.name || `${table}_${fields.join('_')}_idx`;
        try {
            await qi.addIndex(table, fields, { ...options, name: indexName });
            console.log(`✅ Added index ${indexName}`);
        } catch {
            // likely already exists
        }
    };

    await addIndexIfMissing('voting_records', ['voter_id', 'election_id'], {
        unique: true,
        name: 'voting_records_voter_election_unique_idx',
    });
    await addIndexIfMissing('voting_records', ['verification_hash'], {
        unique: dialect !== 'sqlite',
        name: 'voting_records_verification_hash_idx',
    });
    await addIndexIfMissing('voting_records', ['election_id', 'vote_timestamp'], {
        name: 'voting_records_election_time_idx',
    });
    await addIndexIfMissing('vote_nonces', ['voter_id', 'election_id', 'nonce'], {
        unique: true,
        name: 'vote_nonces_voter_election_nonce_unique_idx',
    });

    try {
        await qi.describeTable('poll_approvals');
    } catch {
        await qi.createTable('poll_approvals', {
            approval_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4,
            },
            election_id: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            requested_status: {
                type: Sequelize.STRING(20),
                allowNull: false,
            },
            requested_by_admin_id: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            approver_admin_ids: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: [],
            },
            required_approvals: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 2,
            },
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'PENDING',
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        console.log('✅ Created missing table poll_approvals');
    }

    try {
        await qi.describeTable('outbox_events');
    } catch {
        await qi.createTable('outbox_events', {
            event_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4,
            },
            aggregate_type: {
                type: Sequelize.STRING(64),
                allowNull: false,
            },
            aggregate_id: {
                type: Sequelize.STRING(128),
                allowNull: false,
            },
            event_type: {
                type: Sequelize.STRING(64),
                allowNull: false,
            },
            payload: {
                type: Sequelize.JSON,
                allowNull: false,
            },
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'PENDING',
            },
            retry_count: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            last_error: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            next_attempt_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            processed_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        console.log('✅ Created missing table outbox_events');
    }

    try {
        await qi.describeTable('dead_letter_events');
    } catch {
        await qi.createTable('dead_letter_events', {
            dead_letter_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4,
            },
            source_event_id: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            source_table: {
                type: Sequelize.STRING(64),
                allowNull: false,
                defaultValue: 'outbox_events',
            },
            event_type: {
                type: Sequelize.STRING(64),
                allowNull: false,
            },
            payload: {
                type: Sequelize.JSON,
                allowNull: false,
            },
            error_message: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            failure_count: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            resolved: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            resolved_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        console.log('✅ Created missing table dead_letter_events');
    }

    try {
        await qi.describeTable('vote_saga_status');
    } catch {
        await qi.createTable('vote_saga_status', {
            saga_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4,
            },
            vote_id: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
            },
            voter_id: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            election_id: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            outbox_event_id: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            current_state: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'PENDING',
            },
            last_error: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            state_updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        console.log('✅ Created missing table vote_saga_status');
    }

    try {
        await qi.describeTable('candidate_applications');
    } catch {
        await qi.createTable('candidate_applications', {
            application_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4,
            },
            election_id: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            applicant_name: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            student_id: {
                type: Sequelize.STRING(64),
                allowNull: false,
            },
            email: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            phone: {
                type: Sequelize.STRING(32),
                allowNull: true,
            },
            department: {
                type: Sequelize.STRING(128),
                allowNull: true,
            },
            year: {
                type: Sequelize.STRING(32),
                allowNull: true,
            },
            cgpa: {
                type: Sequelize.DECIMAL(4, 2),
                allowNull: true,
            },
            manifesto: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            requested_party_name: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            requested_party_symbol: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            requested_district_id: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'PENDING',
            },
            reviewed_by_admin_id: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            review_notes: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        console.log('✅ Created missing table candidate_applications');
    }

    await addIndexIfMissing('outbox_events', ['status', 'next_attempt_at'], {
        name: 'outbox_events_status_next_attempt_idx',
    });
    await addIndexIfMissing('dead_letter_events', ['resolved', 'created_at'], {
        name: 'dead_letter_events_resolved_created_idx',
    });
    await addIndexIfMissing('vote_saga_status', ['current_state', 'state_updated_at'], {
        name: 'vote_saga_status_state_time_idx',
    });
    await addIndexIfMissing('candidate_applications', ['election_id', 'status'], {
        name: 'candidate_applications_election_status_idx',
    });
    await addIndexIfMissing('candidate_applications', ['student_id', 'election_id'], {
        name: 'candidate_applications_student_election_idx',
    });

    if (dialect === 'postgres') {
        const schemaToTables = {
            [CONTEXT_SCHEMAS.voter]: ['voters', 'students'],
            [CONTEXT_SCHEMAS.election]: ['elections', 'candidates', 'poll_approvals', 'candidate_applications'],
            [CONTEXT_SCHEMAS.vote]: ['voting_records', 'vote_nonces', 'outbox_events', 'dead_letter_events', 'vote_saga_status'],
        };

        for (const [schemaName, tables] of Object.entries(schemaToTables)) {
            await sequelize.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
            for (const tableName of tables) {
                await sequelize.query(`
                    CREATE OR REPLACE VIEW "${schemaName}"."${tableName}" AS
                    SELECT * FROM public."${tableName}"
                `);
            }
        }
        console.log(`✅ Bounded context schemas/views ensured: ${Object.values(CONTEXT_SCHEMAS).join(', ')}`);
    }
};

const ensureBootstrapAdmin = async () => {
    const bcrypt = require('bcryptjs');
    const { AdminUser } = require('../models/index.js');

    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    const email = process.env.ADMIN_EMAIL || 'admin@election.local';
    if (!username || !password) {
        return;
    }

    const existing = await AdminUser.findOne({ where: { username } });
    if (existing) {
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await AdminUser.create({
        username,
        email,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        is_active: true,
    });
    console.log(`✅ Bootstrapped admin user '${username}' from environment`);
};

// Test PostgreSQL connection
const testPostgresConnection = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ PostgreSQL connected successfully');
    } catch (error) {
        console.error('❌ PostgreSQL connection error:', error.message);
        throw error;
    }
};

// Initialize all database connections
const initializeDatabases = async () => {
    console.log('🔌 Initializing database connections...');

    // Postgres is usually required for core functionality
    await testPostgresConnection();
    await ensureSchemaCompatibility();

    const isTruthy = (value, defaultValue = false) => {
        if (value === undefined || value === null) return defaultValue;
        return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
    };
    const useBoundedContexts = isTruthy(process.env.USE_BOUNDED_CONTEXTS, true);
    const shouldRunSequelizeSync = sequelize.getDialect() === 'sqlite' || !useBoundedContexts;

    if (process.env.NODE_ENV === 'development') {
        if (shouldRunSequelizeSync) {
            await sequelize.sync();
            console.log('✅ Sequelize models synced');
        } else {
            console.log('ℹ️ Sequelize sync skipped in bounded-context mode (dev)');
        }

        console.log('🚀 Starting MongoDB and Redis connections in background (dev mode)...');
        connectMongoDB().catch(() => console.warn('⚠️ MongoDB failed (dev context preserved)'));
        connectRedis().catch(() => console.warn('⚠️ Redis failed (dev context preserved)'));
    } else {
        if (shouldRunSequelizeSync) {
            await sequelize.sync();
            console.log('✅ Sequelize models synced');
        } else {
            console.log('ℹ️ Sequelize sync skipped in bounded-context mode');
        }
        await connectMongoDB();
        await connectRedis();
    }

    await ensureBootstrapAdmin();

    console.log('✅ Database initialization sequence completed');
};

// Close all connections gracefully
const closeDatabases = async () => {
    console.log('🔌 Closing database connections...');

    await sequelize.close();
    await mongoose.connection.close();
    await redisClient.quit();

    console.log('✅ All database connections closed');
};

module.exports = {
    initializeDatabases,
    closeDatabases,
    sequelize,
    mongoose,
    redisClient
};
