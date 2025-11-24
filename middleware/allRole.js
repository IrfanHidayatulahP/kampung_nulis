// middleware/allRole.js
require('dotenv').config();
const { fetchSessionUser } = require('./roleGuard');

module.exports = async function (req, res, next) {
    // fetchSessionUser sudah:
    // - cek login
    // - cek user di DB
    // - destroy session bila user hilang
    // - attach req.user ketika valid
    const user = await fetchSessionUser(req, res);
    if (!user) return; // sudah ditangani redirect/destroy oleh fetchSessionUser

    // Tidak ada cek role karena ALL ROLE diperbolehkan
    return next();
};
