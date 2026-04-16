const PERMISSIONS_BY_ADMIN_ROLE = {
    SUPER_ADMIN: [
        'election:create',
        'election:update',
        'election:transition',
        'eligibility:manage',
        'supervisor:assign',
        'supervisor:session:start',
        'supervisor:session:pause',
        'supervisor:session:resume',
        'supervisor:session:stop',
        'verification:biometric',
        'verification:override:request',
        'verification:override:approve',
        'ballot:issue',
        'audit:read',
        'audit:export',
        'custody:read',
        'custody:write',
        'voter:manage',
        'candidate:manage',
    ],
    ELECTION_OFFICER: [
        'election:create',
        'election:update',
        'election:transition',
        'eligibility:manage',
        'supervisor:assign',
        'verification:override:approve',
        'audit:read',
        'audit:export',
        'custody:read',
        'voter:manage',
        'candidate:manage',
    ],
    TECHNICAL_ADMIN: [
        'election:update',
        'supervisor:assign',
        'verification:override:approve',
        'audit:read',
        'custody:read',
        'custody:write',
    ],
    OBSERVER: [
        'audit:read',
        'results:read',
        'operations:read',
    ],
    SUPERVISOR: [
        'supervisor:session:start',
        'supervisor:session:pause',
        'supervisor:session:resume',
        'supervisor:session:stop',
        'verification:biometric',
        'verification:override:request',
        'ballot:issue',
        'operations:read',
    ],
    AUDITOR: [
        'audit:read',
        'audit:export',
        'custody:read',
    ],
};

const ROLE_CLAIM_BY_ADMIN_ROLE = {
    OBSERVER: 'observer',
    SUPERVISOR: 'supervisor',
    AUDITOR: 'auditor',
};

const getPermissionsForAdminRole = (adminRole) => {
    if (!adminRole) return [];
    return PERMISSIONS_BY_ADMIN_ROLE[adminRole] || [];
};

const getRoleClaimForAdminRole = (adminRole) => {
    return ROLE_CLAIM_BY_ADMIN_ROLE[adminRole] || 'admin';
};

module.exports = {
    PERMISSIONS_BY_ADMIN_ROLE,
    getPermissionsForAdminRole,
    getRoleClaimForAdminRole,
};
