const { AppError } = require('./error.middleware');
const { ROLES } = require('../constants/roles');

const requireRole = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Not authorized to access this route', 401));
    }
    const role = req.user.role ?? ROLES.USER;
    if (!allowedRoles.includes(role)) {
        return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
};

module.exports = { requireRole, ROLES };
