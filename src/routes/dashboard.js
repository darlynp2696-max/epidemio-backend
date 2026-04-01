const router = require('express').Router();
const { getStats, getCommunities } = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/stats',       getStats);
router.get('/communities', getCommunities);

module.exports = router;
