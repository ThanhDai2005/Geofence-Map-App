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

        // Cập nhật isPremium = true cho user
        const updatedUser = await userRepository.updateUser(userId, { isPremium: true });

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Premium activated successfully',
            data: {
                isPremium: updatedUser.isPremium
            }
        });
    } catch (error) {
        next(error);
    }
};
