const express = require('express');

const {
    setupAdmin,
    getSetupStatus,
    loginAdmin,
    getMe,
    listRegistrations,
    getRegistrationById,
    viewIeeeCertificate
} = require('../controllers/admin.controller');

const { protect, isAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/setup', getSetupStatus);
router.post('/setup', express.json(), setupAdmin);
router.post('/login', express.json(), loginAdmin);
router.get('/me', protect, isAdmin, getMe);

router.get('/registrations', protect, isAdmin, listRegistrations);
router.get('/registrations/:id', protect, isAdmin, getRegistrationById);
router.get('/registrations/:id/ieee-certificate', protect, isAdmin, viewIeeeCertificate);

module.exports = router;
