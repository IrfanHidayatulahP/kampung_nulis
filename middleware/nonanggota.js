// middleware/nonAnggota.js
require('dotenv').config();
const { fetchSessionUser } = require('./roleGuard');

/**
 * normalizeRole: mengubah berbagai variasi "Non-Anggota" menjadi 'nonanggota'
 * contohnya: 'Non-Anggota', 'non_anggota', 'non-anggota' -> 'nonanggota'
 */
function normalizeRole(raw) {
    if (!raw) return '';
    return String(raw).toLowerCase().replace(/\s+/g, '').replace(/[_-]/g, '');
}

module.exports = async function (req, res, next) {
    const user = await fetchSessionUser(req, res);
    if (!user) return;

    const roleNorm = normalizeRole(user.role || user.status || '');
    if (roleNorm !== 'nonanggota') {
        return res.status(403).send('Akses ditolak. Halaman ini hanya untuk non-anggota.');
    }

    return next();
};
