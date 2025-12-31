// routes/sewaRoutes.js
const express = require("express");
const router = express.Router();
const sewaController = require("../controller/sewaController");

// Middleware sederhana untuk memastikan user sudah login
const isLogin = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect("/login?error=" + encodeURIComponent("Silakan login terlebih dahulu"));
    }
};

// 1. Rute Riwayat Transaksi (Daftar sewa yang sudah checkout)
// URL: /sewa/list-sewa
router.get("/list-sewa", isLogin, sewaController.showIndex);

// 2. Rute Tambah ke Keranjang (Action dari dashboard/list barang)
// URL: /sewa/add-to-cart
router.post("/add-to-cart", isLogin, sewaController.addToCart);

// 3. Rute Tampilan Keranjang (Cart)
// URL: /sewa/cart
router.get("/cart", isLogin, sewaController.showCart);

// 4. Rute Update Item di Keranjang (Ubah Qty atau Hapus)
// URL: /sewa/update-item
router.post("/update-item", isLogin, sewaController.updateCartItem);

// 5. Rute Checkout (Finalisasi pesanan dari keranjang)
// URL: /sewa/checkout
router.post("/checkout", isLogin, sewaController.checkoutTransaction);

// 6. Rute Detail Transaksi (Untuk melihat rincian barang di riwayat)
// URL: /sewa/detail/12
router.get("/detail/:id", isLogin, sewaController.showTransactionDetail);

module.exports = router;