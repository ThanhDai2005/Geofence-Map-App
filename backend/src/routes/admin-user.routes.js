const express = require('express');
const adminUserController = require('../controllers/admin-user.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(protect);
router.use(requireRole(ROLES.ADMIN));

router.get('/', adminUserController.listUsers);
router.post('/', adminUserController.createUser);
router.put('/:id/role', adminUserController.updateRole);
router.put('/:id/premium', adminUserController.updatePremium);
router.put('/:id/status', adminUserController.updateStatus);

module.exports = router;
