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
}

module.exports = new UserRepository();
