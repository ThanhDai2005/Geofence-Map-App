const mongoose = require('mongoose');

const poiChangeRequestSchema = new mongoose.Schema({
    poi_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poi',
        required: true
    },
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['UPDATE', 'DELETE'],
        required: true
    },
    // For UPDATE, stores the new fields. For DELETE, usually empty.
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING'
    },
    reason: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PoiChangeRequest', poiChangeRequestSchema);
