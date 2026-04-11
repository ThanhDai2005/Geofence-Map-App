const { FEATURES } = require('../constants/features');

class PremiumPlaceholderService {
    getAdvancedPoiPreview() {
        return {
            feature: FEATURES.ADVANCED_POI,
            message: 'Premium placeholder — advanced POI capabilities will be exposed here.'
        };
    }
}

module.exports = new PremiumPlaceholderService();
