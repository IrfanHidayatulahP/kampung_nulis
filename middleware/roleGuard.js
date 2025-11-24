// middleware/roleGuard.js
require('dotenv').config();
const db = require('../config/db');

/**
 * Cari session id di beberapa tempat yang mungkin Anda simpan saat login.
 * Karena PK peminjam adalah `username` (string), kita tunggu string username juga.
 */
function _firstAvailableSessionId(req) {
    if (!req.session) return null;
    if (req.session.userId) return req.session.userId;       // generic id
    if (req.session.username) return req.session.username;   // direct username
    if (req.session.user) {
        if (req.session.user.username) return req.session.user.username;
        if (req.session.user.id_user) return req.session.user.id_user; // in case
        if (req.session.user.id) return req.session.user.id;
    }
    return null;
}

/**
 * Cari model user/peminjam di export db (cek banyak kemungkinan nama).
 * Kembalikan model Sequelize atau null.
 */
function findPeminjamModel() {
    if (!db || typeof db !== 'object') return null;

    const candidates = [
        'peminjam', 'Peminjams', 'Peminjam', 'Peminjams',
        'tbl_peminjam', 'tbl_peminjams', 'tbl_peminjam',
    ];

    // cek top-level keys
    for (const k of candidates) {
        if (db[k]) return db[k];
    }

    // cek container models
    const containers = [db.models, (db.sequelize && db.sequelize.models)];
    for (const container of containers) {
        if (!container || typeof container !== 'object') continue;
        for (const k of candidates) {
            if (container[k]) return container[k];
        }
        // fallback: ambil model yang punya nama mengandung 'peminjam' atau 'pem'
        for (const key of Object.keys(container)) {
            if (key.toLowerCase().includes('peminjam') || key.toLowerCase().includes('peminj')) return container[key];
        }
    }

    // fallback: cari top-level key yang mengandung 'peminjam'
    for (const key of Object.keys(db)) {
        if (key.toLowerCase().includes('peminjam')) return db[key];
    }

    return null;
}

/**
 * fetchSessionUser: ambil user dari session & DB.
 * - tidak menghentikan process saat model tidak ditemukan; redirect ke login.
 * - jika session punya username, gunakan findByPk(username) (PK di model peminjam adalah username).
 */
async function fetchSessionUser(req, res) {
    if (!req.session) {
        console.warn('fetchSessionUser: no session object on request.');
        return res.redirect('/?error=' + encodeURIComponent('Login diperlukan untuk mengakses halaman ini.'));
    }

    const sid = _firstAvailableSessionId(req);
    if (!sid) {
        console.warn('fetchSessionUser: session present but no user id/username found. session keys:', Object.keys(req.session || {}));
        return res.redirect('/?error=' + encodeURIComponent('Login diperlukan untuk mengakses halaman ini.'));
    }

    const Peminjam = findPeminjamModel();
    if (!Peminjam) {
        console.error('fetchSessionUser: peminjam model not found in db export. db keys:', Object.keys(db));
        return res.redirect('/?error=' + encodeURIComponent('Server configuration error (no peminjam model).'));
    }

    try {
        // Sid may be username (string) or numeric id — peminjam PK is username in your model
        // We'll call findByPk(sid) which will work for username primary key
        let userInstance = null;

        if (typeof Peminjam.findByPk === 'function') {
            try {
                userInstance = await Peminjam.findByPk(sid, {
                    attributes: ['username', 'nama_lengkap', 'status', 'alamat', 'no_telpon']
                });
            } catch (e) {
                // ignore and try other strategies below
                console.warn('fetchSessionUser: findByPk threw error, will try findOne fallback.', e);
            }
        }

        // jika belum ketemu dan sid adalah string, coba cari dengan kolom username/nik
        if (!userInstance && typeof sid === 'string' && typeof Peminjam.findOne === 'function') {
            const whereCandidates = [{ username: sid }, { nik: sid }];
            for (const where of whereCandidates) {
                try {
                    userInstance = await Peminjam.findOne({ where, attributes: ['username', 'nama_lengkap', 'status', 'alamat', 'no_telpon'] });
                    if (userInstance) break;
                } catch (_) {
                    // ignore
                }
            }
        }

        if (!userInstance) {
            console.warn(`fetchSessionUser: peminjam not found in DB for session id (${sid}). Destroying session.`);
            req.session.destroy(err => {
                if (err) console.error('Error destroying session (fetchSessionUser):', err);
                return res.redirect('/?error=' + encodeURIComponent('Pengguna tidak ditemukan.'));
            });
            return null;
        }

        const user = userInstance.toJSON ? userInstance.toJSON() : userInstance;
        req.user = user; // attach for controllers/views
        return user;
    } catch (err) {
        console.error('fetchSessionUser: DB error while fetching peminjam for session id:', sid, err);
        req.session.destroy(e => {
            if (e) console.error('Error destroying session after DB error:', e);
            return res.redirect('/?error=' + encodeURIComponent('Sesi Anda tidak valid. Silakan login kembali.'));
        });
        return null;
    }
}

module.exports = { fetchSessionUser, findPeminjamModel };
