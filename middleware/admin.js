// middleware/admin.js
require('dotenv').config();
const db = require('../config/db');

module.exports = async function (req, res, next) {
    // Pastikan sudah login
    if (!req.session || !req.session.userId) {
        return res.redirect('/?error=' + encodeURIComponent('Login diperlukan untuk mengakses halaman ini.'));
    }

    try {
        // Robust: coba beberapa nama model yang mungkin ada di export db
        const UserModel = db.tbl_users || db.peminjam || db.Peminjam || (db.models && (db.models.tbl_users || db.models.peminjam || db.models.Peminjam));

        if (!UserModel) {
            console.error("Model user tidak ditemukan di db exports. Keys:", Object.keys(db));
            return res.status(500).send('Server misconfiguration: model user tidak tersedia.');
        }

        // Ambil data user dari database (sesuaikan primary key Anda)
        const userRec = await UserModel.findByPk(req.session.userId, {
            attributes: ['role', 'status', 'username', 'nama_lengkap']
        });

        if (!userRec) {
            // Jika tidak ditemukan, hapus session dan redirect
            req.session.destroy(err => {
                if (err) console.error('Error destroying session:', err);
                return res.redirect('/?error=' + encodeURIComponent('Pengguna tidak ditemukan.'));
            });
            return;
        }

        const user = typeof userRec.toJSON === 'function' ? userRec.toJSON() : userRec;

        // Periksa role/status (case-insensitive)
        const role = (user.role || user.status || '').toString().trim().toLowerCase();
        if (role !== 'admin') {
            return res.status(403).send('Akses ditolak. Halaman ini hanya untuk admin.');
            // Kalau ingin redirect daripada 403, ubah baris di atas:
            // return res.redirect('/?error=' + encodeURIComponent('Anda tidak memiliki hak akses.'));
        }

        // sukses: pasang user ke req.user dan lanjut
        req.user = user;
        next();
    } catch (err) {
        console.error('admin middleware error:', err && err.message ? err.message : err);
        if (req.session) {
            req.session.destroy(dErr => {
                if (dErr) console.error('Error destroying session:', dErr);
                return res.redirect('/?error=' + encodeURIComponent('Sesi Anda tidak valid. Silakan login kembali.'));
            });
            return;
        }
        return res.redirect('/?error=' + encodeURIComponent('Sesi Anda tidak valid. Silakan login kembali.'));
    }
};
