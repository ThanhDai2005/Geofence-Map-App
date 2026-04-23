const audioQueueService = require('../services/audio-queue.service');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/user.model');

/**
 * Socket.IO handler for real-time audio queue coordination
 * Prevents audio conflicts when multiple users are at the same POI
 */

let io;

function initializeSocket(socketIo) {
    io = socketIo;

    // Socket.IO authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication token required'));
            }

            const decoded = jwt.verify(token, config.jwtSecret);
            const user = await User.findById(decoded.id);

            if (!user) {
                return next(new Error('User not found'));
            }

            socket.userId = user._id.toString();
            socket.deviceId = socket.handshake.auth.deviceId || 'unknown';
            next();
        } catch (error) {
            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] User connected: ${socket.userId} (device: ${socket.deviceId})`);

        // Join POI room when user enters a POI
        socket.on('join-poi', async (data) => {
            const { poiCode } = data;
            socket.join(`poi:${poiCode}`);
            console.log(`[SOCKET] User ${socket.userId} joined POI room: ${poiCode}`);

            // Send current queue status
            const status = await audioQueueService.getQueueStatus(poiCode);
            socket.emit('queue-status', status);
        });

        // Leave POI room
        socket.on('leave-poi', (data) => {
            const { poiCode } = data;
            socket.leave(`poi:${poiCode}`);
            console.log(`[SOCKET] User ${socket.userId} left POI room: ${poiCode}`);
        });

        // Request audio playback
        socket.on('request-audio', async (data) => {
            try {
                const { poiCode, language, narrationLength } = data;

                const entry = await audioQueueService.enqueue(
                    poiCode,
                    socket.userId,
                    socket.deviceId,
                    language || 'vi',
                    narrationLength || 'short'
                );

                const position = await audioQueueService.getUserQueuePosition(
                    poiCode,
                    socket.userId,
                    socket.deviceId
                );

                // Notify user of their queue position
                socket.emit('audio-queued', {
                    entryId: entry._id,
                    poiCode,
                    position
                });

                // Broadcast updated queue status to all users in POI room
                const status = await audioQueueService.getQueueStatus(poiCode);
                io.to(`poi:${poiCode}`).emit('queue-status', status);

                // If user is first in queue, notify them to start playing
                if (entry.status === 'PLAYING') {
                    socket.emit('audio-start', {
                        poiCode,
                        language,
                        narrationLength
                    });
                }
            } catch (error) {
                console.error('[SOCKET] Request audio error:', error);
                socket.emit('audio-error', { message: 'Failed to queue audio' });
            }
        });

        // Audio playback completed
        socket.on('audio-completed', async (data) => {
            try {
                const { poiCode } = data;

                const nextEntry = await audioQueueService.completeAudio(
                    poiCode,
                    socket.userId,
                    socket.deviceId
                );

                // Broadcast updated queue status
                const status = await audioQueueService.getQueueStatus(poiCode);
                io.to(`poi:${poiCode}`).emit('queue-status', status);

                // Notify next user to start playing
                if (nextEntry) {
                    io.to(`poi:${poiCode}`).emit('audio-next', {
                        userId: nextEntry.userId.toString(),
                        deviceId: nextEntry.deviceId
                    });
                }
            } catch (error) {
                console.error('[SOCKET] Audio completed error:', error);
            }
        });

        // Cancel audio queue
        socket.on('cancel-audio', async (data) => {
            try {
                const { poiCode } = data;

                const nextEntry = await audioQueueService.cancelQueue(
                    poiCode,
                    socket.userId,
                    socket.deviceId
                );

                // Broadcast updated queue status
                const status = await audioQueueService.getQueueStatus(poiCode);
                io.to(`poi:${poiCode}`).emit('queue-status', status);

                // Notify next user if cancelled user was playing
                if (nextEntry) {
                    io.to(`poi:${poiCode}`).emit('audio-next', {
                        userId: nextEntry.userId.toString(),
                        deviceId: nextEntry.deviceId
                    });
                }
            } catch (error) {
                console.error('[SOCKET] Cancel audio error:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[SOCKET] User disconnected: ${socket.userId}`);
        });
    });

    // Cleanup old queue entries every 10 minutes
    setInterval(async () => {
        try {
            await audioQueueService.cleanup();
        } catch (error) {
            console.error('[SOCKET] Cleanup error:', error);
        }
    }, 10 * 60 * 1000);
}

module.exports = { initializeSocket };
