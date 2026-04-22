/**
 * Fix premium users without premiumActivatedAt
 * Set premiumActivatedAt = createdAt (or now if createdAt is null)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./src/config');

const userSchema = new mongoose.Schema({
    email: String,
    isPremium: Boolean,
    premiumActivatedAt: Date,
    createdAt: Date,
    updatedAt: Date
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function fixPremiumActivatedAt() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to MongoDB\n');

        // Find premium users without premiumActivatedAt
        const premiumUsersWithoutDate = await User.find({
            isPremium: true,
            premiumActivatedAt: null
        });

        console.log(`Found ${premiumUsersWithoutDate.length} premium users without premiumActivatedAt:\n`);

        for (const user of premiumUsersWithoutDate) {
            // Use createdAt if available, otherwise use current date
            const activationDate = user.createdAt || new Date();

            console.log(`Fixing ${user.email}:`);
            console.log(`  Setting premiumActivatedAt = ${activationDate.toISOString()}`);

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        premiumActivatedAt: activationDate,
                        updatedAt: new Date()
                    }
                }
            );
        }

        console.log(`\n✅ Fixed ${premiumUsersWithoutDate.length} premium users`);

        // Verify
        const stillMissing = await User.countDocuments({
            isPremium: true,
            premiumActivatedAt: null
        });

        console.log(`Remaining premium users without premiumActivatedAt: ${stillMissing}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixPremiumActivatedAt();
