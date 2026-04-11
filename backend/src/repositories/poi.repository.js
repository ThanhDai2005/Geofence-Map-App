const Poi = require('../models/poi.model');
const { POI_STATUS } = require('../constants/poi-status');

class PoiRepository {
    _publicVisibilityFilter() {
        return {
            $or: [
                { status: POI_STATUS.APPROVED },
                { status: { $exists: false } }
            ]
        };
    }

    async findNearby(lng, lat, radiusStr, limitStr, pageStr) {
        const radius = parseInt(radiusStr) || 5000;
        const limit = parseInt(limitStr) || 10;
        const page = parseInt(pageStr) || 1;
        const skip = (page - 1) * limit;

        return await Poi.find({
            $and: [
                this._publicVisibilityFilter(),
                {
                    location: {
                        $near: {
                            $geometry: {
                                type: 'Point',
                                coordinates: [parseFloat(lng), parseFloat(lat)]
                            },
                            $maxDistance: radius
                        }
                    }
                }
            ]
        })
            .skip(skip)
            .limit(limit);
    }

    async findByCode(code, { publicOnly = false } = {}) {
        if (publicOnly) {
            return await Poi.findOne({
                $and: [{ code }, this._publicVisibilityFilter()]
            });
        }
        return await Poi.findOne({ code });
    }

    async create(data) {
        return await Poi.create(data);
    }

    async updateByCode(code, update) {
        return await Poi.findOneAndUpdate({ code }, update, { new: true, runValidators: true });
    }

    async deleteByCode(code) {
        return await Poi.findOneAndDelete({ code });
    }
}

module.exports = new PoiRepository();
