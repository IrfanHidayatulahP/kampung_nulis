// routes/sewaRoutes.js
const express = require('express');
const router = express.Router();
const sewaController = require('../controller/sewaController');

// middleware: hanya anggota yang boleh mengakses
const anggotaOnly = require('../middleware/anggota'); // pastikan file ada: middleware/anggota.js

// LIST transaksi (halaman index)
router.get('/list-sewa', anggotaOnly, sewaController.showIndex);

// DETAIL transaksi (halaman detail)
router.get('/detail/:id', anggotaOnly, sewaController.showTransactionDetail);

// Create cart / transaksi (form + submit)
router.get('/create', anggotaOnly, sewaController.showCreateCartForm);
router.post('/create', anggotaOnly, sewaController.createCart);

// Cart item management
router.post('/:id_transaksi/add', anggotaOnly, sewaController.addToCart);
router.post('/:id_transaksi/item/:id_barang/update', anggotaOnly, sewaController.updateCartItem);
router.post('/:id_transaksi/item/:id_barang/delete', anggotaOnly, sewaController.removeFromCart);

// Checkout & Return
router.post('/:id_transaksi/checkout', anggotaOnly, sewaController.checkoutTransaction);
router.post('/:id_transaksi/return', anggotaOnly, sewaController.returnTransaction);

// API helper: daftar transaksi user (JSON)
router.get('/user/:username', anggotaOnly, sewaController.listUserTransactions);

module.exports = router;
