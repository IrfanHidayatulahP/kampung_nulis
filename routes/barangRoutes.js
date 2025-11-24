// routes/barangRoutes.js
const express = require('express');
const router = express.Router();
const barangController = require('../controller/barangController');

// middlewares
const isAdmin = require('../middleware/admin');
const allRole = require('../middleware/allRole'); // memastikan user login & valid (Admin/Anggota/Non-Anggota)

// Routes
// Lihat (boleh semua role yang sudah login: Admin, Anggota, Non-Anggota)
router.get('/list-barang', allRole, barangController.showIndex);
router.get('/detail/:id', allRole, barangController.showDetail);

// Create / Edit / Delete (hanya Admin)
router.get('/create', isAdmin, barangController.showCreateForm);
router.post('/create', isAdmin, barangController.create);

router.get('/edit/:id', isAdmin, barangController.showEditForm);
router.post('/edit/:id', isAdmin, barangController.update);

router.post('/delete/:id', isAdmin, barangController.delete);

module.exports = router;
