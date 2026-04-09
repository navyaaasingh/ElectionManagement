const CONTEXT_SCHEMAS = {
    voter: process.env.VOTER_CONTEXT_SCHEMA || 'voter_service',
    election: process.env.ELECTION_CONTEXT_SCHEMA || 'election_service',
    vote: process.env.VOTE_CONTEXT_SCHEMA || 'vote_service',
};

const TABLE_CONTEXT_MAP = {
    voters: 'voter',
    students: 'voter',
    elections: 'election',
    candidates: 'election',
    candidate_applications: 'election',
    poll_approvals: 'election',
    voting_records: 'vote',
    vote_nonces: 'vote',
    outbox_events: 'vote',
    dead_letter_events: 'vote',
    vote_saga_status: 'vote',
};

const getContextSchema = (context) => CONTEXT_SCHEMAS[context] || null;

const getSchemaForTable = (tableName) => {
    const context = TABLE_CONTEXT_MAP[tableName];
    return context ? getContextSchema(context) : null;
};

const getQualifiedTableName = (tableName, dialect = 'postgres') => {
    if (dialect !== 'postgres') return tableName;
    const schema = getSchemaForTable(tableName);
    return schema ? `${schema}.${tableName}` : tableName;
};

module.exports = {
    CONTEXT_SCHEMAS,
    TABLE_CONTEXT_MAP,
    getContextSchema,
    getSchemaForTable,
    getQualifiedTableName,
};
