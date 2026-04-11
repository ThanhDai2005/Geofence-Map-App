const premiumPlaceholderService = require('../services/premium-placeholder.service');

exports.getAdvancedPoiPlaceholder = async (req, res, next) => {
    try {
        const data = premiumPlaceholderService.getAdvancedPoiPreview();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
