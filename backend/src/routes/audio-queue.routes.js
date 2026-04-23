const express = require('express');
const router = express.Router();
const audioQueueController = require('../controllers/audio-queue.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// All audio queue routes require authentication
router.use(authMiddleware.protect);

// Enqueue audio request
router.post('/enqueue', audioQueueController.enqueue);

// Get queue status for a POI
router.get('/status/:poiCode', audioQueueController.getQueueStatus);

// Get my position in queue
router.get('/my-position/:poiCode', audioQueueController.getMyPosition);

// Complete audio playback
router.post('/complete', audioQueueController.complete);

// Cancel queue entry
router.post('/cancel', audioQueueController.cancel);

module.exports = router;
