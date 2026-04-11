const express = require('express');
const subscriptionController = require('../controllers/subscription.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

// Protect subscription routes
router.use(protect);

router.post('/upgrade', subscriptionController.upgradeSubscription);

module.exports = router;
