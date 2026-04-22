const premiumPlaceholderService = require('../services/premium-placeholder.service');
const userRepository = require('../repositories/user.repository');

exports.getAdvancedPoiPlaceholder = async (req, res, next) => {
    try {
        const data = premiumPlaceholderService.getAdvancedPoiPreview();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.activatePremium = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // Sử dụng updatePremiumById để tự động set premiumActivatedAt
        const updatedUser = await userRepository.updatePremiumById(userId, true);

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Premium activated successfully',
            data: {
                isPremium: updatedUser.isPremium,
                premiumActivatedAt: updatedUser.premiumActivatedAt
            }
        });
    } catch (error) {
        next(error);
    }
};
