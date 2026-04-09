const { District } = require('../models/index.js');

const normalizeString = (value) => String(value || '').trim().toLowerCase();

const yearsBetween = (fromDate, toDate = new Date()) => {
    const from = new Date(fromDate);
    if (Number.isNaN(from.getTime())) return null;

    const to = new Date(toDate);
    let years = to.getFullYear() - from.getFullYear();
    const monthDiff = to.getMonth() - from.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && to.getDate() < from.getDate())) {
        years -= 1;
    }

    return years;
};

class EligibilityService {
    async evaluateVoter(voter, election, context = {}) {
        const reasons = [];
        const rules = election?.eligibility_rules || {};

        if (!voter) {
            return {
                eligible: false,
                reasons: ['Voter not found'],
                appliedRules: rules,
            };
        }

        if (voter.status !== 'active') {
            reasons.push('Voter must be active');
        }

        if (rules.requireApproved && !voter.is_approved) {
            reasons.push('Voter approval is required');
        }

        if (rules.requireAadhaarVerified && !voter.aadhaar_verified) {
            reasons.push('Aadhaar verification required');
        }

        if (rules.minAge || rules.maxAge) {
            const age = yearsBetween(voter.date_of_birth);
            if (age === null) {
                reasons.push('Date of birth is required for age-based eligibility');
            } else {
                if (rules.minAge && age < Number(rules.minAge)) {
                    reasons.push(`Minimum age ${rules.minAge} required`);
                }
                if (rules.maxAge && age > Number(rules.maxAge)) {
                    reasons.push(`Maximum age ${rules.maxAge} exceeded`);
                }
            }
        }

        if (Array.isArray(rules.allowedParties) && rules.allowedParties.length > 0) {
            const affiliation = normalizeString(voter.party_affiliation);
            const allowed = rules.allowedParties.map(normalizeString);
            if (!allowed.includes(affiliation)) {
                reasons.push('Voter party affiliation is not eligible for this election');
            }
        }

        if (Array.isArray(rules.blockedParties) && rules.blockedParties.length > 0) {
            const affiliation = normalizeString(voter.party_affiliation);
            const blocked = rules.blockedParties.map(normalizeString);
            if (blocked.includes(affiliation)) {
                reasons.push('Voter party affiliation is blocked for this election');
            }
        }

        if (rules.allowedDistrictIds?.length) {
            const allowedDistricts = rules.allowedDistrictIds.map(String);
            if (!allowedDistricts.includes(String(voter.district_id))) {
                reasons.push('Voter district is not part of election eligibility scope');
            }
        }

        if (rules.allowedStates?.length) {
            let voterState = normalizeString(voter.state);
            if (!voterState && voter.district_id) {
                const district = await District.findByPk(voter.district_id);
                voterState = normalizeString(district?.state);
            }
            const allowedStates = rules.allowedStates.map(normalizeString);
            if (!allowedStates.includes(voterState)) {
                reasons.push('Voter state is not eligible for this election');
            }
        }

        if (rules.requiredAttributes && typeof rules.requiredAttributes === 'object') {
            const attrs = rules.requiredAttributes;
            for (const [key, expectedValue] of Object.entries(attrs)) {
                const actualValue = voter[key] ?? voter.location_meta?.[key] ?? context[key];
                if (Array.isArray(expectedValue)) {
                    const options = expectedValue.map(normalizeString);
                    if (!options.includes(normalizeString(actualValue))) {
                        reasons.push(`Attribute ${key} did not match allowed values`);
                    }
                } else if (normalizeString(actualValue) !== normalizeString(expectedValue)) {
                    reasons.push(`Attribute ${key} did not match required value`);
                }
            }
        }

        return {
            eligible: reasons.length === 0,
            reasons,
            appliedRules: rules,
        };
    }

    validateRules(rules = {}) {
        const errors = [];

        if (rules.minAge && Number.isNaN(Number(rules.minAge))) {
            errors.push('minAge must be numeric');
        }
        if (rules.maxAge && Number.isNaN(Number(rules.maxAge))) {
            errors.push('maxAge must be numeric');
        }
        if (rules.minAge && rules.maxAge && Number(rules.minAge) > Number(rules.maxAge)) {
            errors.push('minAge cannot be greater than maxAge');
        }

        const listRuleKeys = ['allowedParties', 'blockedParties', 'allowedStates', 'allowedDistrictIds'];
        for (const key of listRuleKeys) {
            if (rules[key] && !Array.isArray(rules[key])) {
                errors.push(`${key} must be an array`);
            }
        }

        if (rules.requiredAttributes && typeof rules.requiredAttributes !== 'object') {
            errors.push('requiredAttributes must be an object');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}

module.exports = new EligibilityService();