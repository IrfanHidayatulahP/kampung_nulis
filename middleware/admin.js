// middleware/admin.js
require('dotenv').config();
const { fetchSessionUser } = require('./roleGuard');

module.exports = async function (req, res, next) {
    // ambil user, fetchSessionUser akan redirect jika belum login atau user hilang
    const user = await fetchSessionUser(req, res);
    if (!user) return; // sudah di-handle oleh fetchSessionUser

    // cek role admin (case-insensitive)
    const role = String(user.role || user.status || '').toLowerCase();
    if (role !== 'admin') {
        return res.status(403).send('Akses ditolak. Halaman ini hanya untuk admin.');
    }

    // lanjut
    return next();
};
