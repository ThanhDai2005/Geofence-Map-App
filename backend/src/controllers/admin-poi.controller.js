const poiService = require('../services/poi.service');

exports.listPending = async (req, res, next) => {
    try {
        const result = await poiService.listPendingPoisForAdmin(req.query);
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
        const result = await poiService.generateQrScanTokenForAdmin(req.params.id);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.listMaster = async (req, res, next) => {
    try {
        const result = await poiService.listMasterPoisForAdmin(req.query);
        res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

exports.approve = async (req, res, next) => {
    try {
        const data = await poiService.approvePoiById(req.params.id, req.user);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.reject = async (req, res, next) => {
    try {
        const data = await poiService.rejectPoiById(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.listChangeRequests = async (req, res, next) => {
    try {
        const result = await poiService.listPoiChangeRequests(req.query);
        res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

exports.reviewChangeRequest = async (req, res, next) => {
    try {
        const data = await poiService.reviewPoiChangeRequest(req.params.id, req.user, req.body);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
