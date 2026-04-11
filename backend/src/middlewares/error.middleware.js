const errorHandler = (err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] [ERROR] ${err.stack}`);

    const statusCode = err.statusCode || 500;
    const message = err.statusCode ? err.message : 'Internal Server Error';

    let code = 'SERVER_ERROR';
    if (statusCode === 400) code = 'BAD_REQUEST';
    else if (statusCode === 401) code = 'UNAUTHORIZED';
    else if (statusCode === 402) code = 'PAYMENT_REQUIRED';
    else if (statusCode === 403) code = 'FORBIDDEN';
    else if (statusCode === 404) code = 'NOT_FOUND';
    else if (statusCode === 409) code = 'CONFLICT';
    else if (statusCode === 429) code = 'TOO_MANY_REQUESTS';

    res.status(statusCode).json({
        error: {
            code,
            message
        }
    });
};

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

module.exports = {
    errorHandler,
    AppError
};
