const { District } = require('../models/index.js');

const normalizeString = (value) => String(value || '').trim().toLowerCase();
const toArray = (value) => (Array.isArray(value) ? value : []);
const normalizeArray = (value) => toArray(value).map(normalizeString).filter(Boolean);

const ALIAS_MAP = {
    class: 'class_name',
    className: 'class_name',
    academicYear: 'academic_year',
    districtId: 'district_id',
    party: 'party_affiliation',
    aadhaarVerified: 'aadhaar_verified',
    isApproved: 'is_approved',
    hasVoted: 'has_voted',
    dateOfBirth: 'date_of_birth',
};

const resolveAttributeValue = (voter, context, key) => {
    const mappedKey = ALIAS_MAP[key] || key;
    return voter?.[mappedKey] ?? voter?.location_meta?.[mappedKey] ?? context?.[mappedKey] ?? context?.[key];
};

const evaluateAllowedBlockedList = ({ reasons, label, actualValue, allowedValues, blockedValues }) => {
    const normalizedActual = normalizeString(actualValue);
    const allowed = normalizeArray(allowedValues);
    const blocked = normalizeArray(blockedValues);

    if (allowed.length > 0 && !allowed.includes(normalizedActual)) {
        reasons.push(`Voter ${label} is not part of election eligibility scope`);
    }
    if (blocked.length > 0 && blocked.includes(normalizedActual)) {
        reasons.push(`Voter ${label} is blocked for this election`);
    }
};

const evaluateDynamicRule = ({ reasons, voter, context, key, allowedValues, blockedValues }) => {
    const actualValue = resolveAttributeValue(voter, context, key);
    const normalizedActual = normalizeString(actualValue);
    const allowed = normalizeArray(allowedValues);
    const blocked = normalizeArray(blockedValues);

    if (allowed.length > 0 && !allowed.includes(normalizedActual)) {
        reasons.push(`Attribute ${key} is not included in policy scope`);
    }
    if (blocked.length > 0 && blocked.includes(normalizedActual)) {
        reasons.push(`Attribute ${key} is explicitly excluded by policy`);
    }
};

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
        const electionRules = election?.eligibility_rules || {};
        const rules = { ...electionRules };
        delete rules.__meta;

        if (!voter) {
            return {
                eligible: false,
                reasons: ['Voter not found'],
                appliedRules: electionRules,
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

        evaluateAllowedBlockedList({
            reasons,
            label: 'party affiliation',
            actualValue: voter.party_affiliation,
            allowedValues: rules.allowedParties,
            blockedValues: rules.blockedParties || rules.excludedParties,
        });

        evaluateAllowedBlockedList({
            reasons,
            label: 'district',
            actualValue: voter.district_id,
            allowedValues: rules.allowedDistrictIds,
            blockedValues: rules.blockedDistrictIds || rules.excludedDistrictIds,
        });

        if (rules.allowedStates?.length || rules.blockedStates?.length || rules.excludedStates?.length) {
            let voterState = normalizeString(voter.state);
            if (!voterState && voter.district_id) {
                const district = await District.findByPk(voter.district_id);
                voterState = normalizeString(district?.state);
            }

            evaluateAllowedBlockedList({
                reasons,
                label: 'state',
                actualValue: voterState,
                allowedValues: rules.allowedStates,
                blockedValues: rules.blockedStates || rules.excludedStates,
            });
        }

        evaluateAllowedBlockedList({
            reasons,
            label: 'section',
            actualValue: resolveAttributeValue(voter, context, 'section'),
            allowedValues: rules.allowedSections,
            blockedValues: rules.blockedSections || rules.excludedSections,
        });

        evaluateAllowedBlockedList({
            reasons,
            label: 'class',
            actualValue: resolveAttributeValue(voter, context, 'class_name'),
            allowedValues: rules.allowedClassNames || rules.allowedClasses,
            blockedValues: rules.blockedClassNames || rules.excludedClassNames || rules.blockedClasses || rules.excludedClasses,
        });

        evaluateAllowedBlockedList({
            reasons,
            label: 'academic year',
            actualValue: resolveAttributeValue(voter, context, 'academic_year'),
            allowedValues: rules.allowedAcademicYears,
            blockedValues: rules.blockedAcademicYears || rules.excludedAcademicYears,
        });

        evaluateAllowedBlockedList({
            reasons,
            label: 'semester',
            actualValue: resolveAttributeValue(voter, context, 'semester'),
            allowedValues: rules.allowedSemesters,
            blockedValues: rules.blockedSemesters || rules.excludedSemesters,
        });

        if (rules.requiredFlags && typeof rules.requiredFlags === 'object') {
            for (const [flagKey, expectedValue] of Object.entries(rules.requiredFlags)) {
                const actualValue = Boolean(resolveAttributeValue(voter, context, flagKey));
                const expectedBool = typeof expectedValue === 'boolean'
                    ? expectedValue
                    : normalizeString(expectedValue) === 'true';

                if (actualValue !== expectedBool) {
                    reasons.push(`Flag ${flagKey} does not satisfy required value ${expectedBool}`);
                }
            }
        }

        if (rules.include && typeof rules.include === 'object') {
            for (const [key, allowedValues] of Object.entries(rules.include)) {
                evaluateDynamicRule({
                    reasons,
                    voter,
                    context,
                    key,
                    allowedValues,
                    blockedValues: [],
                });
            }
        }

        if (rules.exclude && typeof rules.exclude === 'object') {
            for (const [key, blockedValues] of Object.entries(rules.exclude)) {
                evaluateDynamicRule({
                    reasons,
                    voter,
                    context,
                    key,
                    allowedValues: [],
                    blockedValues,
                });
            }
        }

        if (rules.requiredAttributes && typeof rules.requiredAttributes === 'object') {
            for (const [key, expectedValue] of Object.entries(rules.requiredAttributes)) {
                const actualValue = resolveAttributeValue(voter, context, key);
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
            appliedRules: electionRules,
        };
    }

    validateRules(rules = {}) {
        const errors = [];
        const sanitizedRules = { ...rules };
        delete sanitizedRules.__meta;

        if (sanitizedRules.minAge && Number.isNaN(Number(sanitizedRules.minAge))) {
            errors.push('minAge must be numeric');
        }
        if (sanitizedRules.maxAge && Number.isNaN(Number(sanitizedRules.maxAge))) {
            errors.push('maxAge must be numeric');
        }
        if (sanitizedRules.minAge && sanitizedRules.maxAge && Number(sanitizedRules.minAge) > Number(sanitizedRules.maxAge)) {
            errors.push('minAge cannot be greater than maxAge');
        }

        const listRuleKeys = [
            'allowedParties',
            'blockedParties',
            'excludedParties',
            'allowedStates',
            'blockedStates',
            'excludedStates',
            'allowedDistrictIds',
            'blockedDistrictIds',
            'excludedDistrictIds',
            'allowedSections',
            'blockedSections',
            'excludedSections',
            'allowedClassNames',
            'blockedClassNames',
            'excludedClassNames',
            'allowedAcademicYears',
            'blockedAcademicYears',
            'excludedAcademicYears',
            'allowedSemesters',
            'blockedSemesters',
            'excludedSemesters',
        ];

        for (const key of listRuleKeys) {
            if (sanitizedRules[key] && !Array.isArray(sanitizedRules[key])) {
                errors.push(`${key} must be an array`);
            }
        }

        if (sanitizedRules.requiredAttributes && typeof sanitizedRules.requiredAttributes !== 'object') {
            errors.push('requiredAttributes must be an object');
        }
        if (sanitizedRules.requiredFlags && typeof sanitizedRules.requiredFlags !== 'object') {
            errors.push('requiredFlags must be an object');
        }
        if (sanitizedRules.include && typeof sanitizedRules.include !== 'object') {
            errors.push('include must be an object');
        }
        if (sanitizedRules.exclude && typeof sanitizedRules.exclude !== 'object') {
            errors.push('exclude must be an object');
        }

        for (const dynamicKey of ['include', 'exclude']) {
            if (sanitizedRules[dynamicKey] && typeof sanitizedRules[dynamicKey] === 'object') {
                for (const [key, value] of Object.entries(sanitizedRules[dynamicKey])) {
                    if (!Array.isArray(value)) {
                        errors.push(`${dynamicKey}.${key} must be an array`);
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}

module.exports = new EligibilityService();