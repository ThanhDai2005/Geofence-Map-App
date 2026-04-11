const express = require('express');
const poiRequestController = require('../controllers/poi-request.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

// Protect all POI request routes
router.use(protect);

router.post('/', poiRequestController.createRequest);
router.put('/:id/status', poiRequestController.updateStatus);

module.exports = router;
