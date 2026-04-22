/**
 * Migration Script: Add premiumActivatedAt to existing premium users
 *
 * This script backfills the premiumActivatedAt field for users who are already premium.
 * For existing premium users without this field, we set it to their createdAt date
 * as a reasonable approximation.
 *
 * Run: node backend/scripts/migrate-premium-activated-at.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vngo_travel';

async function migrate() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const User = mongoose.model('User', new mongoose.Schema({
            email: String,
            isPremium: Boolean,
            premiumActivatedAt: Date,
            createdAt: Date
        }, { timestamps: true }));

        // Find all premium users without premiumActivatedAt
        const premiumUsersWithoutDate = await User.find({
            isPremium: true,
            premiumActivatedAt: null
        });

        console.log(`📊 Found ${premiumUsersWithoutDate.length} premium users without premiumActivatedAt`);

        if (premiumUsersWithoutDate.length === 0) {
            console.log('✅ No migration needed. All premium users already have premiumActivatedAt.');
            return;
        }

        // Update each user
        let updated = 0;
        for (const user of premiumUsersWithoutDate) {
            await User.updateOne(
                { _id: user._id },
                { $set: { premiumActivatedAt: user.createdAt } }
            );
            updated++;
        }

        console.log(`✅ Migration complete! Updated ${updated} users.`);
        console.log('📝 Note: premiumActivatedAt was set to createdAt for existing premium users.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

migrate();
