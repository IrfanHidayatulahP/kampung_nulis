// middleware/nonAnggota.js
require('dotenv').config();
const db = require('../config/db');

module.exports = async function (req, res, next) {
    // Pastikan sudah login
    if (!req.session || !req.session.userId) {
        return res.redirect('/?error=' + encodeURIComponent('Login diperlukan untuk mengakses halaman ini.'));
    }

    try {
        const UserModel = db.tbl_users || db.peminjam || db.Peminjam || (db.models && (db.models.tbl_users || db.models.peminjam || db.models.Peminjam));

        if (!UserModel) {
            console.error("Model user tidak ditemukan di db exports. Keys:", Object.keys(db));
            return res.status(500).send('Server misconfiguration: model user tidak tersedia.');
        }

        const userRec = await UserModel.findByPk(req.session.userId, {
            attributes: ['id_user', 'nik', 'role', 'status', 'username', 'nama_lengkap']
        });

        if (!userRec) {
            req.session.destroy(err => {
                if (err) console.error('Error destroying session:', err);
                return res.redirect('/?error=' + encodeURIComponent('Pengguna tidak ditemukan.'));
            });
            return;
        }

        const user = typeof userRec.toJSON === 'function' ? userRec.toJSON() : userRec;

        // Periksa role/status (case-insensitive). catatan: database mungkin menyimpan 'Non-Anggota' atau 'non-anggota'
        const role = (user.role || user.status || '').toString().trim().toLowerCase();
        // allow both 'non-anggota' and 'non anggota' variants if needed
        if (!(role === 'non-anggota' || role === 'non anggota' || role === 'nonanggota')) {
            return res.status(403).send('Akses ditolak. Halaman ini hanya untuk non-anggota.');
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('nonAnggota middleware error:', err && err.message ? err.message : err);
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
