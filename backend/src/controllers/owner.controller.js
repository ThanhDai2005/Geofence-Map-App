const ownerService = require('../services/owner.service');

exports.getMe = async (req, res, next) => {
    try {
        const data = ownerService.getProfile(req.user);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.submitPoi = async (req, res, next) => {
    try {
        const data = await ownerService.submitPoi(req.user, req.body);
        res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
