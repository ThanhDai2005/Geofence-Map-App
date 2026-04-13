const User = require('../models/user.model');

class UserRepository {
    async findByEmail(email) {
        return await User.findOne({ email }).select('+password');
    }
    
    async findById(id) {
        return await User.findById(id);
    }
    
    async updatePremiumStatus(userId, isPremium) {
        return await User.findByIdAndUpdate(userId, { isPremium }, { new: true });
    }
    
    // For seeder
    async createUser(userData) {
        return await User.create(userData);
    }

    async findAllSafe() {
        return await User.find({})
            .select('-password')
            .sort({ createdAt: -1 });
    }

    async updateRoleById(id, role) {
        return await User.findByIdAndUpdate(
            id,
            { role },
            { new: true, runValidators: true }
        ).select('-password');
    }

    async updatePremiumById(id, isPremium) {
        return await User.findByIdAndUpdate(
            id,
            { isPremium: Boolean(isPremium) },
            { new: true, runValidators: true }
        ).select('-password');
    }

    async updateActiveById(id, isActive) {
        return await User.findByIdAndUpdate(
            id,
            { isActive: Boolean(isActive) },
            { new: true, runValidators: true }
        ).select('-password');
    }

    async createByAdmin({ email, password, role, isPremium = false, isActive = true }) {
        const created = await User.create({
            email,
            password,
            role,
            isPremium: Boolean(isPremium),
            isActive: Boolean(isActive)
        });
        return await User.findById(created._id).select('-password');
    }
}

module.exports = new UserRepository();
