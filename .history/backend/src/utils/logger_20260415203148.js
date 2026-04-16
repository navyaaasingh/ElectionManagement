const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

// Compatibility helper for services that emit structured audit events.
logger.auditLog = async (event = {}) => {
    const severity = String(event.severity || '').toUpperCase();
    let level = 'info';

    if (severity === 'CRITICAL') {
        level = 'error';
    } else if (severity === 'HIGH') {
        level = 'warn';
    }

    logger.log(level, event.event_type || 'AUDIT_EVENT', event);
};

// Since some legacy files use require(), we need to export it in a way 
// that might be compatible, but since type="module", require() in other files will crash anyway.
// We'll module.exports = for; ESM.
module.exports = logger;
