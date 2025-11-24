// routes/rusakHilangRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controller/rusakHilangController');

// daftar
router.get('/list', ctrl.showIndex);

// create
router.get('/create', ctrl.showCreateForm);
router.post('/create', ctrl.create);

// edit
router.get('/edit/:id', ctrl.showEditForm);
router.post('/edit/:id', ctrl.update);

// delete
router.post('/delete/:id', ctrl.delete);

// detail (boleh semua role lihat - sesuaikan jika mau admin only)
router.get('/detail/:id', ctrl.showDetail);

module.exports = router;
