const mongoose = require('mongoose');

/**
 * Audio Queue Entry - tracks audio playback requests at POIs
 * Prevents audio conflicts when multiple users are at the same POI
 */
const audioQueueEntrySchema = new mongoose.Schema({
    poiCode: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deviceId: {
        type: String,
        required: true
    },
    language: {
        type: String,
        required: true,
        default: 'vi'
    },
    narrationLength: {
        type: String,
        enum: ['short', 'long'],
        default: 'short'
    },
    status: {
        type: String,
        enum: ['QUEUED', 'PLAYING', 'COMPLETED', 'CANCELLED'],
        default: 'QUEUED',
        index: true
    },
    queuePosition: {
        type: Number,
        default: 0
    },
    estimatedDuration: {
        type: Number, // seconds
        default: 30
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for efficient queue queries
audioQueueEntrySchema.index({ poiCode: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('AudioQueueEntry', audioQueueEntrySchema);
