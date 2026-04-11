const subscriptionService = require('../services/subscription.service');

exports.upgradeSubscription = async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        const result = await subscriptionService.upgradeSubscription(userId);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};
