const express = require('express');
const ownerController = require('../controllers/owner.controller');
const intelligenceHeatmapController = require('../controllers/intelligence-heatmap.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(ROLES.OWNER));

router.get('/me', ownerController.getMe);
router.get('/pois', ownerController.listMySubmissions);
router.post('/pois', ownerController.submitPoi);
router.get('/intelligence/heatmap', intelligenceHeatmapController.getOwnerHeatmap);

module.exports = router;
