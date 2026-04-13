const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/error.middleware');
const { ROLES } = require('../constants/roles');
const mongoose = require('mongoose');

const allowedRoles = new Set(Object.values(ROLES));

exports.listUsers = async (req, res, next) => {
    try {
        const users = await userRepository.findAllSafe();
        const data = users.map((u) => ({
            id: u._id,
            email: u.email,
            role: u.role,
            isPremium: Boolean(u.isPremium),
            isActive: u.isActive !== false,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt
        }));
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.createUser = async (req, res, next) => {
    try {
        const { email, password, role, isPremium = false, isActive = true } = req.body || {};
        if (typeof email !== 'string' || !email.trim()) {
            throw new AppError('Email is required', 400);
        }
        if (typeof password !== 'string' || password.length < 6) {
            throw new AppError('Password must be at least 6 characters', 400);
        }
        if (typeof role !== 'string' || !allowedRoles.has(role)) {
            throw new AppError('Invalid role', 400);
        }
        const existing = await userRepository.findByEmail(email.trim());
        if (existing) {
            throw new AppError('Email already exists', 409);
        }
        const user = await userRepository.createByAdmin({
            email: email.trim().toLowerCase(),
            password,
            role,
            isPremium,
            isActive
        });
        res.status(201).json({
            success: true,
            data: {
                id: user._id,
                email: user.email,
                role: user.role,
                isPremium: Boolean(user.isPremium),
                isActive: user.isActive !== false
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.updateRole = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user id', 400);
        }
        if (String(req.user?._id) === String(id)) {
            throw new AppError('Bạn không thể tự thay đổi vai trò của chính mình.', 400);
        }
        if (typeof role !== 'string' || !allowedRoles.has(role)) {
            throw new AppError('Invalid role', 400);
        }
        const user = await userRepository.updateRoleById(id, role);
        if (!user) {
            throw new AppError('User not found', 404);
        }
        res.status(200).json({
            success: true,
            data: {
                id: user._id,
                email: user.email,
                role: user.role,
                isPremium: Boolean(user.isPremium),
                isActive: user.isActive !== false
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.updatePremium = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isPremium } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user id', 400);
        }
        if (String(req.user?._id) === String(id)) {
            throw new AppError('Bạn không thể tự chỉnh premium của chính mình.', 400);
        }
        if (typeof isPremium !== 'boolean') {
            throw new AppError('isPremium must be a boolean', 400);
        }
        const user = await userRepository.updatePremiumById(id, isPremium);
        if (!user) {
            throw new AppError('User not found', 404);
        }
        res.status(200).json({
            success: true,
            data: {
                id: user._id,
                email: user.email,
                role: user.role,
                isPremium: Boolean(user.isPremium),
                isActive: user.isActive !== false
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user id', 400);
        }
        if (String(req.user?._id) === String(id)) {
            throw new AppError('Bạn không thể tự khóa tài khoản của chính mình.', 400);
        }
        if (typeof isActive !== 'boolean') {
            throw new AppError('isActive must be a boolean', 400);
        }
        const user = await userRepository.updateActiveById(id, isActive);
        if (!user) {
            throw new AppError('User not found', 404);
        }
        res.status(200).json({
            success: true,
            data: {
                id: user._id,
                email: user.email,
                role: user.role,
                isPremium: Boolean(user.isPremium),
                isActive: user.isActive !== false
            }
        });
    } catch (error) {
        next(error);
    }
};
