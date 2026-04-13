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
}

module.exports = new OwnerService();
