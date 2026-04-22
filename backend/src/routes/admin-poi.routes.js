const express = require('express');
const adminPoiController = require('../controllers/admin-poi.controller');
const adminPoiAuditController = require('../controllers/admin-poi-audit.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(protect);
router.use(requireRole(ROLES.ADMIN));

router.get('/pending', adminPoiController.listPending);
router.get('/master', adminPoiController.listMaster);
router.get('/:id/qr-token', adminPoiController.getQrToken);
router.get('/audits', adminPoiAuditController.list);
router.post('/:id/approve', adminPoiController.approve);
router.post('/:id/reject', adminPoiController.reject);
router.get('/change-requests', adminPoiController.listChangeRequests);
router.post('/change-requests/:id/review', adminPoiController.reviewChangeRequest);

module.exports = router;
