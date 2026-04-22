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

exports.listMySubmissions = async (req, res, next) => {
    try {
        const result = await ownerService.listMySubmissions(req.user, req.query);
        res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

exports.getQrToken = async (req, res, next) => {
    try {
        const data = await ownerService.getQrTokenForOwner(req.user, req.params.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.requestUpdate = async (req, res, next) => {
    try {
        const data = await ownerService.requestUpdate(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.requestDelete = async (req, res, next) => {
    try {
        const data = await ownerService.requestDelete(req.user, req.params.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
