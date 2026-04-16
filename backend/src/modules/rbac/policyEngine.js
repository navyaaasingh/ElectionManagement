const hasPermission = (user = {}, permission) => {
    if (!permission) return false;
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    return permissions.includes(permission);
};

const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        if (!hasPermission(req.user, permission)) {
            return res.status(403).json({
                success: false,
                error: 'Permission denied',
                requiredPermission: permission,
            });
        }

        return next();
    };
};

module.exports = {
    hasPermission,
    requirePermission,
};
