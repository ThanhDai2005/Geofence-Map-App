const mongoose = require('mongoose');

const poiRequestSchema = new mongoose.Schema({
    poiData: {
        code: { type: String, required: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true } // [longitude, latitude]
        },
        content: {
            vi: { type: String },
            en: { type: String }
        },
        isPremiumOnly: { type: Boolean, default: false }
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('PoiRequest', poiRequestSchema);
