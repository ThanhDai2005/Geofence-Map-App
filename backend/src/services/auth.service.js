const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/error.middleware');
const config = require('../config');
const { ROLES } = require('../constants/roles');

class AuthService {
    signToken(id) {
        return jwt.sign({ id }, config.jwtSecret, {
            expiresIn: config.jwtExpiresIn
        });
    }

    async login(email, password) {
        if (!email || !password) {
            throw new AppError('Please provide email and password', 400);
        }

        if (typeof email !== 'string' || typeof password !== 'string') {
            throw new AppError('Email and password must be strings', 400);
        }

        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email)) {
            throw new AppError('Invalid email format', 400);
        }

        const user = await userRepository.findByEmail(email);
        
        if (!user || !(await user.comparePassword(password, user.password))) {
            throw new AppError('Incorrect email or password', 401);
        }

        const token = this.signToken(user._id);

        // Remove password from output
        user.password = undefined;

        // DTO Mapping
        return {
            user: {
                id: user._id,
                email: user.email,
                role: user.role ?? ROLES.USER,
                isPremium: user.isPremium
            },
            token
        };
    }
}

module.exports = new AuthService();
