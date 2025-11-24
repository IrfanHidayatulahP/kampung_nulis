const express = require('express');
const router = express.Router();
const barangController = require('../controller/barangController');
const isAdmin = require('../middleware/admin');
// const allRole = require('../middleware/allRole')
// const anggotaAndNonAnggota = require('../middleware/anggotaAndNon-Anggota');

router.get('/list-barang', barangController.showIndex);
router.get('/create', barangController.showCreateForm);
router.post('/create', barangController.create);
router.get('/edit/:id', barangController.showEditForm);
router.post('/edit/:id', barangController.update);
router.post('/delete/:id', barangController.delete);
router.get('/detail/:id', barangController.showDetail);

module.exports = router;