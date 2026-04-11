const PoiRequest = require('../models/poi-request.model');

class PoiRequestRepository {
    async create(requestData) {
        return await PoiRequest.create(requestData);
    }

    async updateStatus(id, status) {
        return await PoiRequest.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        );
    }

    async findById(id) {
        return await PoiRequest.findById(id);
    }
}

module.exports = new PoiRequestRepository();
