// controllers/publicController.js
const barangController = require('./barangController');

exports.home = async (req, res) => {
    try {
        let items = [];
        try {
            // gunakan helper yang lebih robust
            if (typeof barangController.getPublicItems === 'function') {
                items = await barangController.getPublicItems(8);
            } else if (typeof barangController.fetchItems === 'function') {
                // fallback jika Anda mengimplementasikan fetchItems
                const raw = await barangController.fetchItems({ q: null, limit: 8 });
                items = Array.isArray(raw) ? raw.map(r => (r && typeof r.toJSON === 'function' ? r.toJSON() : r)) : [];
            }
        } catch (err) {
            console.error('Gagal mengambil barang publik (fetchItems/getPublicItems):', err);
            items = [];
        }

        // items sudah dalam bentuk normal: { id, nama_barang, stok_tersedia, keterangan }
        // sesuaikan view supaya mudah pakai properti ini — di template Anda sekarang memakai it.stok,
        // jadi kita sediakan juga `stok` field untuk kompatibilitas.
        const itemsForView = items.map(i => ({
            id: i.id ?? null,
            nama_barang: i.nama_barang ?? '',
            stok: (typeof i.stok_tersedia !== 'undefined' && i.stok_tersedia !== null) ? i.stok_tersedia : (typeof i.stok !== 'undefined' ? i.stok : '-'),
            keterangan: i.keterangan ?? ''
        }));

        return res.render('public/dashboard_public', {
            user: req.session.user || null,
            success: req.query.success || null,
            error: req.query.error || null,
            items: itemsForView
        });
    } catch (err) {
        console.error('Public home error:', err);
        return res.render('public/dashboard_public', {
            user: req.session.user || null,
            success: null,
            error: 'Gagal memuat data. Coba lagi nanti.',
            items: []
        });
    }
};
