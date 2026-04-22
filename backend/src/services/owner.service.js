const { ROLES } = require('../constants/roles');
const poiService = require('./poi.service');

class OwnerService {
    getProfile(user) {
        return {
            id: user._id,
            email: user.email,
            role: user.role ?? ROLES.USER
        };
    }

    async submitPoi(user, body) {
        return poiService.createOwnerPoi(user, body);
    }

    async listMySubmissions(user, query) {
        return poiService.listOwnerSubmissions(user, query);
    }

    async getQrTokenForOwner(user, poiId) {
        return poiService.generateQrScanTokenForOwner(poiId, user);
    }

    async requestUpdate(user, poiId, body) {
        return poiService.requestPoiUpdate(poiId, user, body);
    }

    async requestDelete(user, poiId) {
        return poiService.requestPoiDelete(poiId, user);
    }
}

module.exports = new OwnerService();
