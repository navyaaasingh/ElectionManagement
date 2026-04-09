/**
 * MAC Address Filtering for IoT Terminals
 * Security middleware to ensure only authorized terminals can connect
 */

const AuditLog = require('../models/auditLog.model');

class MACFilter {
    constructor() {
        // Whitelist of authorized terminal MAC addresses
        // In production, load from database
        this.authorizedMACs = new Set([
            '00:1B:44:11:3A:B7', // TERMINAL_001
            '00:1B:44:11:3A:B8', // TERMINAL_002
            '00:1B:44:11:3A:B9', // TERMINAL_003
            // Add more as needed
        ]);

        // Blacklist for blocked terminals
        this.blacklistedMACs = new Set();

        // Track connection attempts
        this.connectionAttempts = new Map();

        // Max failed attempts before automatic blacklist
        this.maxFailedAttempts = 5;
    }

    /**
     * Add MAC address to whitelist
     */
    authorize(macAddress, terminalId) {
        const normalized = this.normalizeMac(macAddress);
        this.authorizedMACs.add(normalized);

        console.log(`✅ MAC ${normalized} authorized for terminal ${terminalId}`);

        return true;
    }

    /**
     * Remove MAC from whitelist
     */
    revoke(macAddress) {
        const normalized = this.normalizeMac(macAddress);
        this.authorizedMACs.delete(normalized);

        console.log(`❌ MAC ${normalized} authorization revoked`);

        return true;
    }

    /**
     * Add MAC to blacklist
     */
    blacklist(macAddress, reason) {
        const normalized = this.normalizeMac(macAddress);
        this.blacklistedMACs.add(normalized);

        // Log to audit
        AuditLog.create({
            event_type: 'MAC_BLACKLISTED',
            action: 'MAC_BLACKLIST',
            user_id: 'system',
            status: 'success',
            details: {
                mac_address: normalized,
                reason,
            },
        }).catch(() => null);

        console.log(`🚫 MAC ${normalized} blacklisted: ${reason}`);

        return true;
    }

    /**
     * Remove MAC from blacklist
     */
    unblacklist(macAddress) {
        const normalized = this.normalizeMac(macAddress);
        this.blacklistedMACs.delete(normalized);

        console.log(`✓ MAC ${normalized} removed from blacklist`);

        return true;
    }

    /**
     * Check if MAC address is allowed to connect
     */
    isAllowed(macAddress) {
        const normalized = this.normalizeMac(macAddress);

        // Check blacklist first
        if (this.blacklistedMACs.has(normalized)) {
            return {
                allowed: false,
                reason: 'MAC address is blacklisted',
            };
        }

        // Check whitelist
        if (!this.authorizedMACs.has(normalized)) {
            // Track failed attempt
            this.trackFailedAttempt(normalized);

            return {
                allowed: false,
                reason: 'MAC address not authorized',
            };
        }

        // Reset failed attempts on success
        this.connectionAttempts.delete(normalized);

        return {
            allowed: true,
        };
    }

    /**
     * Track failed connection attempts
     */
    trackFailedAttempt(macAddress) {
        const attempts = this.connectionAttempts.get(macAddress) || 0;
        const newAttempts = attempts + 1;

        this.connectionAttempts.set(macAddress, newAttempts);

        // Auto-blacklist after max attempts
        if (newAttempts >= this.maxFailedAttempts) {
            this.blacklist(macAddress, `${newAttempts} failed connection attempts`);
        }
    }

    /**
     * Normalize MAC address format
     */
    normalizeMac(macAddress) {
        // Convert to uppercase and ensure consistent format
        return macAddress
            .toUpperCase()
            .replace(/[^0-9A-F]/g, '')
            .match(/.{1,2}/g)
            .join(':');
    }

    /**
     * Get whitelist
     */
    getWhitelist() {
        return Array.from(this.authorizedMACs);
    }

    /**
     * Get blacklist
     */
    getBlacklist() {
        return Array.from(this.blacklistedMACs);
    }

    /**
     * Get connection attempt statistics
     */
    getAttemptStats() {
        const stats = [];

        for (const [mac, attempts] of this.connectionAttempts.entries()) {
            stats.push({ macAddress: mac, attempts });
        }

        return stats.sort((a, b) => b.attempts - a.attempts);
    }
}

// Middleware for Express
function macFilterMiddleware(req, res, next) {
    // Extract MAC from request (could be in header or body)
    const macAddress = req.headers['x-terminal-mac'] || req.body?.terminalMac;

    if (!macAddress) {
        return res.status(400).json({
            success: false,
            message: 'Terminal MAC address required',
        });
    }

    const filter = getMACFilter();
    const result = filter.isAllowed(macAddress);

    if (!result.allowed) {
        // Log unauthorized attempt
        AuditLog.create({
            event_type: 'UNAUTHORIZED_TERMINAL_ACCESS',
            action: 'TERMINAL_ACCESS_DENIED',
            user_id: 'anonymous',
            ip_address: req.ip,
            status: 'failure',
            details: {
                mac_address: macAddress,
                reason: result.reason,
            },
        }).catch(() => null);

        return res.status(403).json({
            success: false,
            message: result.reason,
        });
    }

    // Attach MAC to request for later use
    req.terminalMac = macAddress;

    next();
}

// Singleton
let macFilter = null;

function getMACFilter() {
    if (!macFilter) {
        macFilter = new MACFilter();
    }
    return macFilter;
}

module.exports = {
    MACFilter,
    getMACFilter,
    macFilterMiddleware,
};
