const rateLimit = require('express-rate-limit');

// General API rate limiter - 100 requests per 15 minutes
exports.apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requests per window
    message: {
        error: 'Too many requests',
        message: 'Please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict rate limiter for vote casting - 1 vote per election per voter
exports.voteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 5, // Max 5 vote attempts per hour (to prevent abuse while allowing re-attempts on errors)
    message: {
        error: 'Too many vote attempts',
        message: 'Please contact election officials if you need assistance',
    },
    skipSuccessfulRequests: true, // Only count failed requests
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth rate limiter - 5 login attempts per 15 minutes
exports.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        error: 'Too many login attempts',
        message: 'Account temporarily locked. Try again in 15 minutes',
    },
    // Only throttle repeated failures; successful logins should not consume quota.
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
});

// Results query limiter - 30 requests per minute
exports.resultsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: {
        error: 'Too many result queries',
        message: 'Please wait before refreshing results',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Receipt verification limiter - tighter to avoid brute-force hash probing
exports.verifyLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: {
        error: 'Too many verification attempts',
        message: 'Please wait before trying again',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
