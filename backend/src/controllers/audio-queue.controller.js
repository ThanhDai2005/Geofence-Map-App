const audioQueueService = require('../services/audio-queue.service');

/**
 * Audio Queue Controller
 * Handles HTTP endpoints for audio queue management
 */

/**
 * POST /audio-queue/enqueue
 * Add user to audio queue for a POI
 */
exports.enqueue = async (req, res) => {
    try {
        const { poiCode, language, narrationLength } = req.body;
        const userId = req.user._id;
        const deviceId = req.headers['x-device-id'] || 'unknown';

        if (!poiCode) {
            return res.status(400).json({
                success: false,
                message: 'poiCode is required'
            });
        }

        const entry = await audioQueueService.enqueue(
            poiCode,
            userId,
            deviceId,
            language || 'vi',
            narrationLength || 'short'
        );

        const queueStatus = await audioQueueService.getUserQueuePosition(poiCode, userId, deviceId);

        res.json({
            success: true,
            data: {
                entryId: entry._id,
                poiCode: entry.poiCode,
                status: entry.status,
                queuePosition: queueStatus
            }
        });
    } catch (error) {
        console.error('[AUDIO-QUEUE] Enqueue error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to enqueue audio request'
        });
    }
};

/**
 * GET /audio-queue/status/:poiCode
 * Get queue status for a POI
 */
exports.getQueueStatus = async (req, res) => {
    try {
        const { poiCode } = req.params;
        const status = await audioQueueService.getQueueStatus(poiCode);

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('[AUDIO-QUEUE] Get status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get queue status'
        });
    }
};

/**
 * GET /audio-queue/my-position/:poiCode
 * Get current user's position in queue
 */
exports.getMyPosition = async (req, res) => {
    try {
        const { poiCode } = req.params;
        const userId = req.user._id;
        const deviceId = req.headers['x-device-id'] || 'unknown';

        const position = await audioQueueService.getUserQueuePosition(poiCode, userId, deviceId);

        if (!position) {
            return res.json({
                success: true,
                data: {
                    inQueue: false
                }
            });
        }

        res.json({
            success: true,
            data: {
                inQueue: true,
                ...position
            }
        });
    } catch (error) {
        console.error('[AUDIO-QUEUE] Get position error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get queue position'
        });
    }
};

/**
 * POST /audio-queue/complete
 * Mark audio as completed and advance queue
 */
exports.complete = async (req, res) => {
    try {
        const { poiCode } = req.body;
        const userId = req.user._id;
        const deviceId = req.headers['x-device-id'] || 'unknown';

        if (!poiCode) {
            return res.status(400).json({
                success: false,
                message: 'poiCode is required'
            });
        }

        const nextEntry = await audioQueueService.completeAudio(poiCode, userId, deviceId);

        res.json({
            success: true,
            data: {
                completed: true,
                nextUser: nextEntry ? {
                    userId: nextEntry.userId,
                    deviceId: nextEntry.deviceId
                } : null
            }
        });
    } catch (error) {
        console.error('[AUDIO-QUEUE] Complete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete audio'
        });
    }
};

/**
 * POST /audio-queue/cancel
 * Cancel user's queue entry
 */
exports.cancel = async (req, res) => {
    try {
        const { poiCode } = req.body;
        const userId = req.user._id;
        const deviceId = req.headers['x-device-id'] || 'unknown';

        if (!poiCode) {
            return res.status(400).json({
                success: false,
                message: 'poiCode is required'
            });
        }

        const nextEntry = await audioQueueService.cancelQueue(poiCode, userId, deviceId);

        res.json({
            success: true,
            data: {
                cancelled: true,
                nextUser: nextEntry ? {
                    userId: nextEntry.userId,
                    deviceId: nextEntry.deviceId
                } : null
            }
        });
    } catch (error) {
        console.error('[AUDIO-QUEUE] Cancel error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel queue entry'
        });
    }
};
