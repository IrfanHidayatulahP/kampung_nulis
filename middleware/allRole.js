// middleware/AllRole.js
require('dotenv').config();
const db = require('../config/db');

module.exports = async function (req, res, next) {
    // Pastikan sudah login (mengikuti pola Anda: req.session.userId)
    if (!req.session || !req.session.userId) {
        return res.redirect('/?error=' + encodeURIComponent('Login diperlukan untuk mengakses halaman ini.'));
    }

    try {
        // Robust model lookup (coba beberapa nama yang mungkin diexport)
        const UserModel = db.tbl_users || db.peminjam || db.Peminjam || (db.models && (db.models.tbl_users || db.models.peminjam || db.models.Peminjam));

        if (!UserModel) {
            console.error("Model user tidak ditemukan di db exports. Keys:", Object.keys(db));
            return res.status(500).send('Server misconfiguration: model user tidak tersedia.');
        }

        // Ambil user berdasarkan PK (sesuaikan bila primary key berbeda)
        const userRec = await UserModel.findByPk(req.session.userId, {
            attributes: ['role', 'status', 'username', 'nama_lengkap']
        });

        if (!userRec) {
            // tidak ditemukan: destroy session lalu redirect
            req.session.destroy(err => {
                if (err) console.error('Error destroying session:', err);
                return res.redirect('/?error=' + encodeURIComponent('Pengguna tidak ditemukan.'));
            });
            return;
        }

        const user = typeof userRec.toJSON === 'function' ? userRec.toJSON() : userRec;

        // Normalisasi role/status (case-insensitive)
        const roleRaw = (user.role || user.status || '').toString().trim().toLowerCase();

        // Terima varian 'non-anggota' juga
        const isNonAnggota = (roleRaw === 'non-anggota' || roleRaw === 'non anggota' || roleRaw === 'nonanggota');

        // Allowed roles: admin, anggota, non-anggota
        if (roleRaw === 'admin' || roleRaw === 'anggota' || isNonAnggota) {
            // Pasang user ke req.user dan res.locals.user, lalu lanjut
            req.user = user;
            res.locals.user = user;
            return next();
        }

        // Jika bukan salah satu role yang diperbolehkan -> tolak akses
        return res.status(403).send('Akses ditolak. Hanya Admin / Anggota / Non-Anggota yang dapat mengakses halaman ini.');
    } catch (err) {
        console.error('AllRole middleware error:', err && err.message ? err.message : err);
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
