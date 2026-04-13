const adminPoiAuditRepository = require('../repositories/admin-poi-audit.repository');
const AdminPoiAudit = require('../models/admin-poi-audit.model');
const { AppError } = require('../middlewares/error.middleware');

class AdminPoiAuditService {
    /**
     * Persists a moderation audit row. Required after every successful PENDING → APPROVED/REJECTED transition.
     * Throws if persistence fails (logs are mandatory).
     */
    async recordModeration({ adminId, poiId, action, previousStatus, newStatus, reason, session }) {
        if (action !== AdminPoiAudit.ACTION.APPROVE && action !== AdminPoiAudit.ACTION.REJECT) {
            throw new AppError('Invalid audit action', 500);
        }
        try {
            await adminPoiAuditRepository.create({
                adminId,
                poiId,
                action,
                previousStatus,
                newStatus,
                reason: reason ?? null
            }, { session });
        } catch (err) {
            console.error('[AdminPoiAudit] persistence failed', err);
            throw new AppError('Failed to persist audit log', 500);
        }
    }

    mapAuditDto(doc) {
        const admin = doc.adminId && typeof doc.adminId === 'object'
            ? {
                id: doc.adminId._id,
                email: doc.adminId.email,
                role: doc.adminId.role
            }
            : null;
        const poi = doc.poiId && typeof doc.poiId === 'object'
            ? {
                id: doc.poiId._id,
                code: doc.poiId.code,
                content: doc.poiId.content || {}
            }
            : null;

        return {
            id: doc._id,
            action: doc.action,
            previousStatus: doc.previousStatus ?? null,
            newStatus: doc.newStatus ?? null,
            reason: doc.reason ?? null,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            admin,
            poi
        };
    }

    async listAudits(page, limit) {
        const { items, total, page: p, limit: l } = await adminPoiAuditRepository.findPaginated({
            page,
            limit
        });
        const totalPages = Math.ceil(total / l) || 0;
        return {
            items: items.map((row) => this.mapAuditDto(row)),
            pagination: {
                page: p,
                limit: l,
                total,
                totalPages
            }
        };
    }
}

module.exports = new AdminPoiAuditService();
