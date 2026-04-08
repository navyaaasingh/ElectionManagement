const crypto = require('crypto');

const csrfSecret = process.env.CSRF_SECRET || process.env.JWT_SECRET || 'change-me-csrf-secret';

const makeCsrfToken = (user) => {
    const identity = `${user.adminId || user.username || 'admin'}:${user.role || 'admin'}:${user.adminRole || ''}`;
    return crypto.createHmac('sha256', csrfSecret).update(identity).digest('hex');
};

const csrfProtection = (req, res, next) => {
    const enforce = ['1', 'true', 'yes', 'on'].includes(String(process.env.ENFORCE_CSRF || (process.env.NODE_ENV === 'production')).toLowerCase());
    if (!enforce) return next();

    if (!req.user || req.user.role !== 'admin') {
        return next();
    }

    const token = req.headers['x-csrf-token'];
    const expected = makeCsrfToken(req.user);
    if (!token || token !== expected) {
        return res.status(403).json({
            success: false,
            error: 'CSRF validation failed',
        });
    }
    return next();
};

module.exports = {
    csrfProtection,
    makeCsrfToken,
};
