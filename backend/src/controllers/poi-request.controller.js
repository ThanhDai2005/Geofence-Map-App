const poiRequestService = require('../services/poi-request.service');

exports.createRequest = async (req, res, next) => {
    try {
        // user is injected by the protect middleware
        const userId = req.user.id;
        const result = await poiRequestService.createRequest(req.body, userId);

        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const result = await poiRequestService.updateRequestStatus(id, status);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};
