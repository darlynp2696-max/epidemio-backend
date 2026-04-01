const router = require('express').Router();
const multer = require('multer');
const {
  getCases, getCasesForMap, getCaseById,
  createCase, updateCase, deleteCase,
  exportCases, importCases, getDiseases
} = require('../controllers/casesController');
const { authenticate, authorize } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.get('/diseases', getDiseases);
router.get('/map',      getCasesForMap);
router.get('/export',   exportCases);
router.post('/import',  authorize('admin', 'epidemiologist'), upload.single('file'), importCases);

router.get('/',         getCases);
router.post('/',        authorize('admin', 'epidemiologist'), createCase);
router.get('/:id',      getCaseById);
router.put('/:id',      authorize('admin', 'epidemiologist'), updateCase);
router.delete('/:id',   authorize('admin'), deleteCase);

module.exports = router;
