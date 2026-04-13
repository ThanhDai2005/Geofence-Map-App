const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const poiRepository = require('../repositories/poi.repository');
const adminPoiAuditService = require('./admin-poi-audit.service');
const AdminPoiAudit = require('../models/admin-poi-audit.model');
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
        const mappedPois = pois.map((poi) => {
            const base = this.mapPoiDto(poi, 'en');
            const c = poi.content && typeof poi.content.toObject === 'function'
                ? poi.content.toObject()
                : { ...(poi.content || {}) };
            return {
                ...base,
                contentByLang: {
                    vi: c.vi || '',
                    en: c.en || ''
                }
            };
        });

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

    _mapModerationDto(poi) {
        const content = poi.content && typeof poi.content.toObject === 'function'
            ? poi.content.toObject()
            : { ...(poi.content || {}) };
        return {
            id: poi._id,
            code: poi.code,
            status: poi.status ?? null,
            rejectionReason: poi.rejectionReason ?? null,
            submittedBy: poi.submittedBy ?? null,
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

    async listPendingPoisForAdmin(query = {}) {
        const page = Math.max(parseInt(query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
        const skip = (page - 1) * limit;

        const [pois, total] = await Promise.all([
            poiRepository.findPending({ limit, skip }),
            poiRepository.countPending()
        ]);

        const totalPages = Math.ceil(total / limit) || 0;

        return {
            items: pois.map((p) => this._mapModerationDto(p)),
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        };
    }

    /** Paginated list of all POIs (any status) for admin master CRUD UI. */
    async listMasterPoisForAdmin(query = {}) {
        const page = Math.max(parseInt(query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
        const skip = (page - 1) * limit;

        const [pois, total] = await Promise.all([
            poiRepository.findAllForAdmin({ limit, skip }),
            poiRepository.countAll()
        ]);

        const totalPages = Math.ceil(total / limit) || 0;

        return {
            items: pois.map((p) => this._mapModerationDto(p)),
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        };
    }

    async approvePoiById(rawId, adminUser) {
        if (!rawId || typeof rawId !== 'string') {
            throw new AppError('POI id is required', 400);
        }
        if (!poiRepository.isValidObjectId(rawId)) {
            throw new AppError('Invalid POI id', 400);
        }

        const poi = await poiRepository.findById(rawId);
        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        const status = poi.status;

        if (status === POI_STATUS.REJECTED) {
            throw new AppError('Cannot approve a rejected POI', 409);
        }

        if (status === POI_STATUS.APPROVED || status === undefined || status === null) {
            return this._mapModerationDto(poi);
        }

        if (status !== POI_STATUS.PENDING) {
            throw new AppError('POI cannot be approved from its current state', 409);
        }

        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                let updated = await poiRepository.transitionPendingToApproved(rawId, { session });
                if (!updated) {
                    const latest = await poiRepository.findById(rawId);
                    if (latest && latest.status === POI_STATUS.APPROVED) {
                        result = latest;
                        return;
                    }
                    throw new AppError('POI could not be approved', 409);
                }

                await adminPoiAuditService.recordModeration({
                    adminId: adminUser._id,
                    poiId: updated._id,
                    action: AdminPoiAudit.ACTION.APPROVE,
                    previousStatus: POI_STATUS.PENDING,
                    newStatus: POI_STATUS.APPROVED,
                    reason: null,
                    session
                });
                result = updated;
            });

            this._invalidateCache();
            return this._mapModerationDto(result);
        } finally {
            session.endSession();
        }
    }

    async rejectPoiById(rawId, body, adminUser) {
        if (!rawId || typeof rawId !== 'string') {
            throw new AppError('POI id is required', 400);
        }
        if (!poiRepository.isValidObjectId(rawId)) {
            throw new AppError('Invalid POI id', 400);
        }

        const reason = body && typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason) {
            throw new AppError('Rejection reason is required', 400);
        }

        const poi = await poiRepository.findById(rawId);
        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        const status = poi.status;

        if (status === POI_STATUS.REJECTED) {
            return this._mapModerationDto(poi);
        }

        if (status === POI_STATUS.APPROVED || status === undefined || status === null) {
            throw new AppError('Cannot reject a POI that is already public', 409);
        }

        if (status !== POI_STATUS.PENDING) {
            throw new AppError('POI cannot be rejected from its current state', 409);
        }

        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                let updated = await poiRepository.transitionPendingToRejected(rawId, reason, { session });
                if (!updated) {
                    const latest = await poiRepository.findById(rawId);
                    if (latest && latest.status === POI_STATUS.REJECTED) {
                        result = latest;
                        return;
                    }
                    throw new AppError('POI could not be rejected', 409);
                }

                await adminPoiAuditService.recordModeration({
                    adminId: adminUser._id,
                    poiId: updated._id,
                    action: AdminPoiAudit.ACTION.REJECT,
                    previousStatus: POI_STATUS.PENDING,
                    newStatus: POI_STATUS.REJECTED,
                    reason,
                    session
                });
                result = updated;
            });

            this._invalidateCache();
            return this._mapModerationDto(result);
        } finally {
            session.endSession();
        }
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

    async listOwnerSubmissions(user, query = {}) {
        const page = Math.max(parseInt(query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
        const skip = (page - 1) * limit;

        const [pois, total] = await Promise.all([
            poiRepository.findBySubmitter(user._id, { limit, skip }),
            poiRepository.countBySubmitter(user._id)
        ]);

        const totalPages = Math.ceil(total / limit) || 0;

        return {
            items: pois.map((p) => this._mapModerationDto(p)),
            pagination: { page, limit, total, totalPages }
        };
    }

    /**
     * ADMIN: mint permanent signed JWT for printed QR (`type: static_secure_qr`).
     * No exp — physical QR stays valid; tampering fails signature verify.
     */
    async generateQrScanTokenForAdmin(rawPoiId) {
        if (!rawPoiId || typeof rawPoiId !== 'string') {
            throw new AppError('POI id is required', 400);
        }
        if (!poiRepository.isValidObjectId(rawPoiId)) {
            throw new AppError('Invalid POI id', 400);
        }
        const doc = await poiRepository.findById(rawPoiId);
        if (!doc) {
            throw new AppError('POI not found', 404);
        }
        const code = String(doc.code || '').trim();
        const token = jwt.sign(
            { code, type: 'static_secure_qr' },
            config.jwtSecret
        );
        const scanUrl = `${config.scanQrUrlBase}?t=${encodeURIComponent(token)}`;
        return { token, scanUrl, permanent: true };
    }

    /**
     * Authenticated user: redeem QR JWT and return full POI when allowed.
     */
    async resolveQrScanToken(rawToken, user) {
        if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
            throw new AppError('token is required', 400);
        }
        let decoded;
        try {
            decoded = jwt.verify(rawToken.trim(), config.jwtSecret);
        } catch (e) {
            throw new AppError('Invalid or expired QR token', 401);
        }

        let poi = null;
        if (decoded.type === 'static_secure_qr' && decoded.code) {
            const code = String(decoded.code).trim().toUpperCase();
            poi = await poiRepository.findByCode(code);
        } else if (decoded.type === 'qr_scan' && decoded.poiId) {
            poi = await poiRepository.findById(decoded.poiId);
        } else {
            throw new AppError('Invalid QR token payload', 400);
        }

        if (!poi) {
            throw new AppError('POI not found', 404);
        }
        const st = poi.status;
        if (st === POI_STATUS.PENDING || st === POI_STATUS.REJECTED) {
            throw new AppError('POI is not available for scanning', 403);
        }
        if (st && st !== POI_STATUS.APPROVED) {
            throw new AppError('POI is not available for scanning', 403);
        }
        if (poi.isPremiumOnly && !user.isPremium) {
            throw new AppError('Premium subscription required for this POI', 403);
        }
        this._invalidateCache();
        return this._mapModerationDto(poi);
    }
}

module.exports = new PoiService();
