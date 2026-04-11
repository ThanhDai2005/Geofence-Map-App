const { AppError } = require('./error.middleware');
const config = require('../config');

const requestTimeout = (req, res, next) => {
    // Set timeout from config
    const timeoutId = setTimeout(() => {
        if (!res.headersSent) {
            next(new AppError('Request timeout - Service unavailable', 503));
        }
    }, config.timeout.ms);

    // Clear timeout if response finishes
    res.on('finish', () => clearTimeout(timeoutId));
    res.on('close', () => clearTimeout(timeoutId));

    next();
};

module.exports = { requestTimeout };
