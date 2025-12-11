// middleware/anggotaAtauNonAnggota.js
require('dotenv').config();
const { fetchSessionUser } = require('./roleGuard');

/**
 * normalizeRole: ubah berbagai variasi role menjadi bentuk sederhana:
 * 'Anggota' -> 'anggota'
 * 'Non-Anggota' / 'non_anggota' / 'nonanggota' -> 'nonanggota'
 */
function normalizeRole(raw) {
    if (!raw) return '';
    return String(raw).toLowerCase().replace(/\s+/g, '').replace(/[_-]/g, '');
}

module.exports = async function (req, res, next) {
    // ambil user dari session; fetchSessionUser akan handle redirect/destroy jika perlu
    const user = await fetchSessionUser(req, res);
    if (!user) return; // sudah di-handle oleh fetchSessionUser

    const roleNorm = normalizeRole(user.role || user.status || '');

    // boleh jika anggota OR non-anggota
    const allowed = ['Anggota', 'Non-Anggota'];

    if (!allowed.includes(roleNorm)) {
        return res.status(403).send('Akses ditolak. Halaman ini hanya untuk anggota atau non-anggota.');
    }

    return next();
};
