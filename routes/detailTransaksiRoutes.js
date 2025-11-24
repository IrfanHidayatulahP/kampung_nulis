// routes/detailTransaksi.js
const express = require('express');
const router = express.Router();
const controller = require('../controller/detailTransaksiController');

router.get('/list-detail', controller.showIndex);
router.get('/create', controller.showCreateForm);
router.post('/create', controller.create);
router.get('/edit/:id', controller.showEditForm);
router.post('/edit/:id', controller.update);
router.post('/delete/:id', controller.delete);
router.get('/detail/:id', controller.showDetail);

module.exports = router;
