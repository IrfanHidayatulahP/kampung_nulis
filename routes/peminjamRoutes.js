// routes/peminjamRoutes.js
const express = require('express');
const router = express.Router();
const peminjamController = require('../controller/peminjamController');

router.get('/list-peminjam', peminjamController.showIndex);
router.get('/create', peminjamController.showCreateForm);
router.post('/create', peminjamController.create);
router.get('/edit/:username', peminjamController.showEditForm);
router.post('/edit/:username', peminjamController.update);
router.post('/delete/:username', peminjamController.delete);
router.get('/detail/:username', peminjamController.showDetail);

module.exports = router;
