/**
 * Script to approve all PENDING POIs
 * Run: node approve-pending-pois.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./src/config');

const poiSchema = new mongoose.Schema({
    code: String,
    name: String,
    status: String,
    submittedBy: mongoose.Schema.Types.ObjectId,
    createdAt: Date,
    updatedAt: Date
}, { collection: 'pois' });

const Poi = mongoose.model('Poi', poiSchema);

async function approvePendingPois() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to MongoDB');

        // Find all PENDING POIs
        const pendingPois = await Poi.find({ status: 'PENDING' });
        console.log(`\nFound ${pendingPois.length} PENDING POIs:`);

        pendingPois.forEach((poi, index) => {
            console.log(`${index + 1}. ${poi.code} - ${poi.name}`);
        });

        if (pendingPois.length === 0) {
            console.log('\nNo PENDING POIs to approve.');
            process.exit(0);
        }

        // Approve all PENDING POIs
        const result = await Poi.updateMany(
            { status: 'PENDING' },
            {
                $set: {
                    status: 'APPROVED',
                    updatedAt: new Date()
                }
            }
        );

        console.log(`\n✅ Successfully approved ${result.modifiedCount} POIs`);

        // Verify
        const stillPending = await Poi.countDocuments({ status: 'PENDING' });
        console.log(`Remaining PENDING POIs: ${stillPending}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

approvePendingPois();
