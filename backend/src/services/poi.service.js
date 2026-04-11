const poiRepository = require('../repositories/poi.repository');
const { AppError } = require('../middlewares/error.middleware');
const Cache = require('../utils/cache');
const config = require('../config');
const { POI_STATUS } = require('../constants/poi-status');

const poiCache = new Cache(config.cache.ttl);
const ownerPoiSubmissionCache = new Cache(10);

setInterval(() => poiCache.cleanup(), 3600000);
setInterval(() => ownerPoiSubmissionCache.cleanup(), 60000);

class PoiService {
    // Helper to format/map DTO
    mapPoiDto(poi, lang) {
        return {
            id: poi._id,
            code: poi.code,
            location: {
                lat: poi.location.coordinates[1],
                lng: poi.location.coordinates[0]
            },
            content: poi.content[lang] || poi.content.en || '', // fallback to en
            isPremiumOnly: poi.isPremiumOnly
        };
    }

    async getNearbyPois(lat, lng, radius, limit, page = 1) {
        // Validation
        if (!lat || !lng) {
            throw new AppError('Latitude and Longitude are required', 400);
        }

        if ((typeof lat !== 'string' && typeof lat !== 'number') || 
            (typeof lng !== 'string' && typeof lng !== 'number')) {
            throw new AppError('Invalid input type for coordinates', 400);
        }

        if (isNaN(Number(lat)) || isNaN(Number(lng))) {
            throw new AppError('Latitude and Longitude must be valid numbers', 400);
        }

        // Pagination validation
        const verifiedLimit = Math.min(parseInt(limit) || 10, 50);
        const verifiedPage = Math.max(parseInt(page) || 1, 1);

        // Cache lookup
        const cacheKey = `nearby:${lat}:${lng}:${radius}:${verifiedLimit}:${verifiedPage}`;
        const cachedData = poiCache.get(cacheKey);
        if (cachedData) {
            console.log(`[CACHE] Hit: ${cacheKey}`);
            return cachedData;
        }

        const pois = await poiRepository.findNearby(lng, lat, radius, verifiedLimit, verifiedPage);
        const mappedPois = pois.map(poi => this.mapPoiDto(poi, 'en'));

        // Store in cache
        poiCache.set(cacheKey, mappedPois);
        
        return mappedPois;
    }

    async getPoiByCode(code, lang = 'en') {
        const cacheKey = `poi:${code}:${lang}`;
        const cachedPoi = poiCache.get(cacheKey);
        if (cachedPoi) {
            console.log(`[CACHE] Hit: ${cacheKey}`);
            return cachedPoi;
        }

        const poi = await poiRepository.findByCode(code, { publicOnly: true });

        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        const result = this.mapPoiDto(poi, lang);
        
        // Store in cache
        poiCache.set(cacheKey, result);

        return result;
    }

    _invalidateCache() {
        poiCache.clear();
    }

    _buildLocationPayload(body) {
        const { lat, lng } = body.location || {};
        if (lat === undefined || lng === undefined) {
            throw new AppError('location.lat and location.lng are required', 400);
        }
        if ((typeof lat !== 'string' && typeof lat !== 'number') ||
            (typeof lng !== 'string' && typeof lng !== 'number')) {
            throw new AppError('Invalid input type for coordinates', 400);
        }
        if (isNaN(Number(lat)) || isNaN(Number(lng))) {
            throw new AppError('Latitude and Longitude must be valid numbers', 400);
        }
        return {
            type: 'Point',
            coordinates: [Number(lng), Number(lat)]
        };
    }

    async createPoi(body) {
        if (!body || typeof body.code !== 'string' || !body.code.trim()) {
            throw new AppError('POI code is required', 400);
        }
        const location = this._buildLocationPayload(body);
        const doc = {
            code: body.code.trim(),
            location,
            content: body.content || {},
            isPremiumOnly: Boolean(body.isPremiumOnly),
            status: POI_STATUS.APPROVED,
            submittedBy: null
        };
        const poi = await poiRepository.create(doc);
        this._invalidateCache();
        return this.mapPoiDto(poi, 'en');
    }

    async updatePoiByCode(code, body) {
        if (!code) {
            throw new AppError('POI code is required', 400);
        }
        const existing = await poiRepository.findByCode(code);
        if (!existing) {
            throw new AppError('POI not found', 404);
        }
        const update = {};
        if (body.location) {
            update.location = this._buildLocationPayload(body);
        }
        if (body.content !== undefined) {
            const prev = existing.content && typeof existing.content.toObject === 'function'
                ? existing.content.toObject()
                : { ...(existing.content || {}) };
            update.content = { ...prev, ...body.content };
        }
        if (body.isPremiumOnly !== undefined) {
            update.isPremiumOnly = Boolean(body.isPremiumOnly);
        }
        const poi = await poiRepository.updateByCode(code, update);
        this._invalidateCache();
        return this.mapPoiDto(poi, 'en');
    }

    async deletePoiByCode(code) {
        if (!code) {
            throw new AppError('POI code is required', 400);
        }
        const deleted = await poiRepository.deleteByCode(code);
        if (!deleted) {
            throw new AppError('POI not found', 404);
        }
        this._invalidateCache();
        return { code: deleted.code };
    }

    validatePoiInput(body, { mode = 'owner' } = {}) {
        if (!body || typeof body !== 'object') {
            throw new AppError('Request body is required', 400);
        }
        const raw = { ...body };
        delete raw.status;

        if (mode !== 'owner') {
            throw new AppError('Unsupported validation mode', 500);
        }

        if (typeof raw.code !== 'string' || !raw.code.trim()) {
            throw new AppError('POI code is required', 400);
        }

        if (typeof raw.name !== 'string' || !raw.name.trim()) {
            throw new AppError('Name is required', 400);
        }

        if (raw.radius === undefined || raw.radius === null || raw.radius === '') {
            throw new AppError('Radius is required', 400);
        }
        const radius = Number(raw.radius);
        if (Number.isNaN(radius) || radius < 1 || radius > 100000) {
            throw new AppError('Radius must be a valid number between 1 and 100000 meters', 400);
        }

        const location = this._buildLocationPayload(raw);

        const content = { en: raw.name.trim() };
        if (raw.content && typeof raw.content === 'object' && typeof raw.content.vi === 'string' && raw.content.vi.trim()) {
            content.vi = raw.content.vi.trim();
        }

        return {
            code: raw.code.trim(),
            location,
            content,
            radius
        };
    }

    checkDuplicateSubmission(ownerId, code) {
        const key = `ownerSubmit:${String(ownerId)}:${code}`;
        if (ownerPoiSubmissionCache.get(key)) {
            throw new AppError('Please wait before submitting the same POI code again', 429);
        }
    }

    _mapOwnerSubmittedPoi(poi) {
        const content = poi.content && typeof poi.content.toObject === 'function'
            ? poi.content.toObject()
            : { ...(poi.content || {}) };
        return {
            id: poi._id,
            code: poi.code,
            name: content.en || '',
            status: poi.status,
            ownerId: poi.submittedBy,
            location: {
                lat: poi.location.coordinates[1],
                lng: poi.location.coordinates[0]
            },
            content,
            isPremiumOnly: poi.isPremiumOnly,
            createdAt: poi.createdAt,
            updatedAt: poi.updatedAt
        };
    }

    async createOwnerPoi(user, body) {
        const payload = this.validatePoiInput(body, { mode: 'owner' });

        const existing = await poiRepository.findByCode(payload.code);
        if (existing) {
            throw new AppError('A POI with this code already exists', 409);
        }

        this.checkDuplicateSubmission(user._id, payload.code);

        const doc = {
            code: payload.code,
            location: payload.location,
            content: payload.content,
            isPremiumOnly: false,
            status: POI_STATUS.PENDING,
            submittedBy: user._id
        };

        const poi = await poiRepository.create(doc);
        const submitKey = `ownerSubmit:${String(user._id)}:${payload.code}`;
        ownerPoiSubmissionCache.set(submitKey, true);
        this._invalidateCache();

        return this._mapOwnerSubmittedPoi(poi);
    }
}

module.exports = new PoiService();
