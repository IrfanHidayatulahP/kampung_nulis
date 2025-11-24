// middleware/anggota.js
require('dotenv').config();
const { fetchSessionUser } = require('./roleGuard');

module.exports = async function (req, res, next) {
    const user = await fetchSessionUser(req, res);
    if (!user) return;

    const role = String(user.role || user.status || '').toLowerCase();
    if (role !== 'anggota') {
        return res.status(403).send('Akses ditolak. Halaman ini hanya untuk anggota.');
    }

    return next();
};
