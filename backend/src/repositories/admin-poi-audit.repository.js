const AdminPoiAudit = require('../models/admin-poi-audit.model');

class AdminPoiAuditRepository {
    async create(entry, options = {}) {
        return await AdminPoiAudit.create([entry], options);
    }

    async findPaginated({ page, limit }) {
        const safePage = Math.max(1, parseInt(page, 10) || 1);
        const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
        const skip = (safePage - 1) * safeLimit;

        const [items, total] = await Promise.all([
            AdminPoiAudit.find()
                .populate({ path: 'adminId', select: 'email role' })
                .populate({ path: 'poiId', select: 'code content' })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            AdminPoiAudit.countDocuments()
        ]);

        return {
            items,
            total,
            page: safePage,
            limit: safeLimit
        };
    }
}

module.exports = new AdminPoiAuditRepository();
