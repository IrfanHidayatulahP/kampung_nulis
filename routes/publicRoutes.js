// routes/publicRoutes.js
const express = require('express');
const router = express.Router();
const publicController = require('../controller/publicController');

router.get('/', publicController.home);

// tambahkan route publik lainnya bila perlu (catalog, item detail, contact, dsb)
// router.get('/catalog', publicController.catalog);

module.exports = router;
