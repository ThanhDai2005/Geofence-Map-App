const mongoose = require('mongoose');
const { POI_STATUS } = require('../constants/poi-status');

const poiSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    content: {
        vi: { type: String },
        en: { type: String }
    },
    isPremiumOnly: { type: Boolean, default: false },
    status: {
        type: String,
        enum: Object.values(POI_STATUS),
        default: POI_STATUS.PENDING
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
    timestamps: true
});

poiSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Poi', poiSchema);
