const router = require('express').Router();
const { login, register, getProfile, getUsers } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/login',    login);
router.post('/register', authenticate, authorize('admin'), register);
router.get('/profile',   authenticate, getProfile);
router.get('/users',     authenticate, authorize('admin', 'epidemiologist'), getUsers);

module.exports = router;
