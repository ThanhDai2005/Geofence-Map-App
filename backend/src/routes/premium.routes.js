const express = require('express');
const premiumController = require('../controllers/premium.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requirePremium } = require('../middlewares/subscription.middleware');

const router = express.Router();

// Route để kích hoạt Premium (không cần requirePremium vì đang mua)
router.post('/activate', protect, premiumController.activatePremium);

router.use(protect);
router.use(requirePremium);

router.get('/advanced-poi', premiumController.getAdvancedPoiPlaceholder);

module.exports = router;
