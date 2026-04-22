/**
 * Check premium users and their activation dates
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./src/config');

const userSchema = new mongoose.Schema({
    email: String,
    isPremium: Boolean,
    premiumActivatedAt: Date,
    createdAt: Date
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function checkPremiumUsers() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to MongoDB\n');

        const allUsers = await User.find({}).sort({ createdAt: -1 });
        console.log(`Total users: ${allUsers.length}\n`);

        const premiumUsers = await User.find({ isPremium: true }).sort({ premiumActivatedAt: -1 });
        console.log(`Premium users: ${premiumUsers.length}\n`);

        console.log('Premium users details:');
        console.log('='.repeat(80));
        premiumUsers.forEach((user, index) => {
            console.log(`${index + 1}. ${user.email}`);
            console.log(`   isPremium: ${user.isPremium}`);
            console.log(`   createdAt: ${user.createdAt}`);
            console.log(`   premiumActivatedAt: ${user.premiumActivatedAt || 'NULL (NOT SET!)'}`);
            console.log('');
        });

        // Check date range
        const start = new Date('2026-04-08T00:00:00.000Z');
        const end = new Date('2026-04-23T23:59:59.999Z');

        const newPremiumInRange = await User.countDocuments({
            isPremium: true,
            premiumActivatedAt: { $gte: start, $lte: end }
        });

        console.log('='.repeat(80));
        console.log(`Premium activated between ${start.toISOString()} and ${end.toISOString()}: ${newPremiumInRange}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkPremiumUsers();
