// routes/transaksi.js
const express = require('express');
const router = express.Router();
const transaksiController = require('../controller/transaksiSewaController');

router.get('/list-transaksi', transaksiController.showIndex);
router.get('/create', transaksiController.showCreateForm);
router.post('/create', transaksiController.create);
router.get('/edit/:id', transaksiController.showEditForm);
router.post('/edit/:id', transaksiController.update);
router.post('/delete/:id', transaksiController.delete);
router.get('/detail/:id', transaksiController.showDetail);

module.exports = router;
