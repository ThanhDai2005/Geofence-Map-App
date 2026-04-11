const poiRequestRepository = require('../repositories/poi-request.repository');
const { AppError } = require('../middlewares/error.middleware');

class PoiRequestService {
    async createRequest(poiData, userId) {
        if (!poiData || !poiData.code || !poiData.location || !poiData.location.lat || !poiData.location.lng) {
            throw new AppError('Invalid POI request data. Code, lat and lng are required.', 400);
        }

        // Strict type validation to prevent NoSQL injection via object manipulation
        if (typeof poiData.code !== 'string' || 
            (typeof poiData.location.lat !== 'string' && typeof poiData.location.lat !== 'number') || 
            (typeof poiData.location.lng !== 'string' && typeof poiData.location.lng !== 'number')) {
            throw new AppError('Invalid input types for POI request data', 400);
        }

        if (isNaN(Number(poiData.location.lat)) || isNaN(Number(poiData.location.lng))) {
            throw new AppError('Latitude and Longitude must be valid numbers', 400);
        }

        const requestData = {
            poiData: {
                ...poiData,
                location: {
                    type: 'Point',
                    coordinates: [Number(poiData.location.lng), Number(poiData.location.lat)]
                }
            },
            createdBy: userId,
            status: 'pending'
        };

        const result = await poiRequestRepository.create(requestData);
        
        return {
            id: result._id,
            poiData: {
                code: result.poiData.code,
                location: {
                    lat: result.poiData.location.coordinates[1],
                    lng: result.poiData.location.coordinates[0]
                },
                content: result.poiData.content,
                isPremiumOnly: result.poiData.isPremiumOnly
            },
            status: result.status,
            createdBy: result.createdBy,
            createdAt: result.createdAt
        };
    }

    async updateRequestStatus(id, status) {
        const validStatuses = ['approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            throw new AppError('Invalid status', 400);
        }

        const request = await poiRequestRepository.findById(id);
        if (!request) {
            throw new AppError('POI Request not found', 404);
        }

        const result = await poiRequestRepository.updateStatus(id, status);

        return {
            id: result._id,
            status: result.status,
            updatedAt: result.updatedAt
        };
    }
}

module.exports = new PoiRequestService();
