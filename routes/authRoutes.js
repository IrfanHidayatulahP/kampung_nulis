// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controller/authController');
const dashboardController = require('../controller/dashboardController');
const { attachUser, ensureAuthenticated, requireRole, adminOnly, anggotaOnly, nonAnggotaOnly } = require('../middleware/auth');

/* Public auth routes */
router.get('/login', authController.showLogin);
router.post('/login', authController.login);

// register routes
router.get('/register', authController.showRegister);
router.post('/register', authController.register);

// logout (but hanya bisa jika login)
router.get('/logout', attachUser, authController.logout);

/* Root always to login (user ingin view pertama tetap login) */
router.get('/', (req, res) => {
  return res.redirect('/login');
});

/* Role-based dashboards (same as before) */
/* Admin */
router.get('/admin/dashboard_admin', ...adminOnly, dashboardController.adminDashboard);
router.get('/admin/users', ...adminOnly, (req, res) => res.send('Halaman manajemen pengguna (Admin).'));

/* Anggota */
router.get('/anggota/dashboard_anggota', ...anggotaOnly, dashboardController.anggotaDashboard);
router.get('/anggota/profile', ...anggotaOnly, (req, res) => {
  res.render('anggota/profile', { user: req.peminjam || req.session.user });
});

/* Non-Anggota */
router.get('/nonanggota/dashboard_nonanggota', ...nonAnggotaOnly, dashboardController.nonAnggotaDashboard);
router.get('/nonanggota/info', ...nonAnggotaOnly, (req, res) => res.send('Halaman informasi untuk Non-Anggota.'));

/* Shared area example */
router.get('/shared-area', attachUser, requireRole(['Admin','Anggota']), (req, res) => {
  res.send('Area bersama untuk Admin dan Anggota.');
});

module.exports = router;
