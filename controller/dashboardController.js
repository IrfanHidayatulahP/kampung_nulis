// controllers/dashboardController.js
const barangController = require('./barangController'); // sesuaikan path jika perlu
const db = require('../config/db'); // sesuaikan path jika perlu
const { Op } = require('sequelize');

let Transaksi = db.transaksi_sewa || db.transaksiSewa || db.Transaksi_sewa || db.TransaksiSewa || (db.models && (db.models.transaksi_sewa || db.models.Transaksi_sewa));
let Barang = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));
let Peminjam = db.peminjam || db.Peminjam || (db.models && (db.models.peminjam || db.models.Peminjam));

// Ambil status user dari session (safety)
function getUserStatus(req) {
    try {
        return req.session && req.session.user && req.session.user.status
            ? String(req.session.user.status)
            : null;
    } catch (e) {
        return null;
    }
}

// Helper untuk ambil items lalu tambahkan display_price sesuai role
async function fetchItemsWithDisplayPrice(req, limit = 12) {
    const q = req.query.q || "";
    const rawItems = await barangController.getPublicItems(limit, q) || [];

    const userStatus = (getUserStatus(req) || "").toLowerCase().replace(/\s+/g, '');
    const isNonAnggota = userStatus.includes('non') || userStatus.includes('nonanggota') || userStatus.includes('non-anggota');

    const items = (Array.isArray(rawItems) ? rawItems : []).map(i => {
        const plain = (i && typeof i.toJSON === 'function') ? i.toJSON() : (i || {});
        const basePrice = Number(plain.harga_dasar_sewa || 0);
        const display_price = isNonAnggota ? basePrice * 2 : basePrice;

        return {
            ...plain,
            id: plain.id || plain.id_barang || plain.id_barang,
            display_price
        };
    });

    return { items, q };
}

/**
 * adminDashboard (tidak berubah)
 */
exports.adminDashboard = async (req, res) => {
    try {
        const user = req.peminjam || req.session.user || null;
        const currentUsername = req.session.user ? req.session.user.username : null;
        let userData = req.session.user;

        if (currentUsername && Peminjam) {
            userData = await Peminjam.findOne({ where: { username: currentUsername } });
        }

        // Eksekusi query count
        const [jumlahPeminjam, jumlahTransaksi, jumlahBarangReady] = await Promise.all([
            Peminjam ? Peminjam.count() : 0,
            Transaksi ? Transaksi.count() : 0,
            Barang ? Barang.count({
                where: {
                    // CEK DISINI: Ganti 'stok' dengan nama kolom yang benar di DB Anda
                    // Biasanya 'stok_barang', 'stok', atau 'jumlah'
                    [Op.or]: [
                        { stok: { [Op.gt]: 0 } },
                        { stok_barang: { [Op.gt]: 0 } }
                    ]
                }
            }).catch(() => {
                // Jika masih error karena nama kolom salah, hitung total semua barang saja
                return Barang.count();
            }) : 0
        ]);

        res.render('admin/dashboard_admin', {
            user,
            jumlahPeminjam,
            jumlahTransaksi,
            jumlahBarangReady
        });
    } catch (err) {
        console.error('adminDashboard error:', err);
        res.render('admin/dashboard_admin', {
            user: req.session.user,
            jumlahPeminjam: 0,
            jumlahTransaksi: 0,
            jumlahBarangReady: 0,
            error: 'Gagal memuat statistik dashboard'
        });
    }
};

/**
 * anggotaDashboard: render halaman anggota dengan items + display_price
 */
exports.anggotaDashboard = async (req, res) => {
    try {
        const { items, q } = await fetchItemsWithDisplayPrice(req, 12);
        res.render('anggota/dashboard_anggota', {
            items,
            filter_q: q,
            user: req.session.user,
        });
    } catch (err) {
        console.error('anggotaDashboard error:', err);
        res.render('anggota/dashboard_anggota', {
            items: [],
            filter_q: req.query.q || '',
            user: req.session.user,
            error: 'Gagal memuat daftar barang'
        });
    }
};
