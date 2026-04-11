const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/error.middleware');
const { featureRequiresPremium, isKnownFeature } = require('../constants/features');

class SubscriptionService {
    checkIsPremium(user) {
        if (!user) return false;
        return Boolean(user.isPremium);
    }

    requirePremium(user) {
        if (!this.checkIsPremium(user)) {
            throw new AppError('Premium subscription required', 402);
        }
    }

    isFeatureAllowed(user, featureKey) {
        if (!featureKey || typeof featureKey !== 'string') return false;
        if (!isKnownFeature(featureKey)) return false;
        if (!featureRequiresPremium(featureKey)) return true;
        return this.checkIsPremium(user);
    }

    canAccessFeature(user, feature) {
        return this.isFeatureAllowed(user, feature);
    }

    async upgradeSubscription(userId) {
        const user = await userRepository.updatePremiumStatus(userId, true);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        return {
            id: user._id,
            email: user.email,
            isPremium: user.isPremium
        };
    }
}

module.exports = new SubscriptionService();
