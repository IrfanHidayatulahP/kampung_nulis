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

/* Admin */
router.get('/admin/dashboard_admin', ...adminOnly, dashboardController.adminDashboard);
router.get('/admin/users', ...adminOnly, (req, res) => res.send('Halaman manajemen pengguna (Admin).'));

/* Anggota & Non-Anggota -> sama dashboard anggota (dilindungi oleh role check) */
router.get('/anggota/dashboard_anggota', attachUser, requireRole(['Anggota', 'Non-Anggota']), dashboardController.anggotaDashboard);
router.get('/nonanggota/dashboard_nonanggota', attachUser, requireRole(['Anggota', 'Non-Anggota']), dashboardController.anggotaDashboard);

/* Profile (contoh) */
router.get('/anggota/profile', attachUser, requireRole(['Anggota', 'Non-Anggota']), (req, res) => {
  res.render('anggota/profile', { user: req.peminjam || req.session.user });
});

/* Shared area example */
router.get('/shared-area', attachUser, requireRole(['Admin', 'Anggota']), (req, res) => {
  res.send('Area bersama untuk Admin dan Anggota.');
});

module.exports = router;
