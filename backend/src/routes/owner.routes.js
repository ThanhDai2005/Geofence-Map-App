const express = require('express');
const ownerController = require('../controllers/owner.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(ROLES.OWNER));

router.get('/me', ownerController.getMe);
router.get('/pois', ownerController.listMySubmissions);
router.post('/pois', ownerController.submitPoi);

module.exports = router;
