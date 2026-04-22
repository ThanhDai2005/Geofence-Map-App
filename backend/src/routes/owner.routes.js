const express = require('express');
const ownerController = require('../controllers/owner.controller');
const intelligenceMetricsController = require('../controllers/intelligence-metrics.controller');
const intelligenceHeatmapController = require('../controllers/intelligence-heatmap.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(ROLES.OWNER));

router.get('/me', ownerController.getMe);
router.get('/pois', ownerController.listMySubmissions);
router.post('/pois', ownerController.submitPoi);
router.get('/pois/:id/qr-token', ownerController.getQrToken);
router.post('/pois/:id/request-update', ownerController.requestUpdate);
router.post('/pois/:id/request-delete', ownerController.requestDelete);
router.get('/intelligence/heatmap', intelligenceHeatmapController.getOwnerHeatmap);
router.get('/intelligence/metrics/timeline', intelligenceMetricsController.getOwnerTimeline);
router.get('/intelligence/metrics/events-by-family', intelligenceMetricsController.getOwnerEventsByFamily);

module.exports = router;
