// controllers/dashboardController.js
const barangController = require('./barangController'); // sesuaikan path jika perlu

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
exports.adminDashboard = (req, res) => {
    const user = req.peminjam || req.session.user || null;
    res.render('admin/dashboard_admin', { user });
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
