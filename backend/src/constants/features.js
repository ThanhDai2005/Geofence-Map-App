const FEATURES = Object.freeze({
    ADVANCED_POI: 'ADVANCED_POI',
    TRANSLATION_API: 'TRANSLATION_API'
});

const FEATURE_KEYS = new Set(Object.values(FEATURES));

const FEATURE_KEYS_REQUIRING_PREMIUM = new Set([
    FEATURES.ADVANCED_POI,
    FEATURES.TRANSLATION_API
]);

function featureRequiresPremium(featureKey) {
    return FEATURE_KEYS_REQUIRING_PREMIUM.has(featureKey);
}

function isKnownFeature(featureKey) {
    return FEATURE_KEYS.has(featureKey);
}

module.exports = {
    FEATURES,
    featureRequiresPremium,
    isKnownFeature
};
