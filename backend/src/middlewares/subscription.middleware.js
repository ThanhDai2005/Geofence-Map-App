const subscriptionService = require('../services/subscription.service');
const { AppError } = require('./error.middleware');

const requirePremium = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Not authorized to access this route', 401));
    }
    if (!subscriptionService.checkIsPremium(req.user)) {
        return next(new AppError('Premium subscription required', 402));
    }
    next();
};

module.exports = { requirePremium };
