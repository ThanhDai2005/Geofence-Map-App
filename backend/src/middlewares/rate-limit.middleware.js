const { AppError } = require('./error.middleware');
const config = require('../config');

const WINDOW_MS = config.rateLimit.windowMs;
const MAX_REQUESTS = config.rateLimit.max;

const ipRequestMap = new Map();

// Cleanup map every minute to prevent memory leaks
setInterval(() => {
    ipRequestMap.clear();
}, WINDOW_MS);

const rateLimiter = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    const currentRequestCount = ipRequestMap.get(ip) || 0;

    if (currentRequestCount >= MAX_REQUESTS) {
        return next(new AppError('Too many requests from this IP, please try again after a minute', 429));
    }

    ipRequestMap.set(ip, currentRequestCount + 1);
    next();
};

module.exports = { rateLimiter };
