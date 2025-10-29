// middleware/auth.js
const db = require('../config/db');

/**
 * attachUser
 * - Pastikan ada session.username
 * - Ambil data user dari DB dan set req.peminjam (tanpa password)
 */
exports.attachUser = async (req, res, next) => {
    try {
        if (!req.session || !req.session.username) {
            return res.redirect('/login');
        }

        const peminjam = await db.peminjam.findByPk(req.session.username, {
            attributes: ['username', 'nama_lengkap', 'status', 'alamat', 'no_telpon', 'tgl_daftar']
        });

        if (!peminjam) {
            req.session.destroy(err => {
                if (err) console.error('Error destroying session:', err);
                return res.redirect('/login?error=' + encodeURIComponent('Pengguna tidak ditemukan. Silakan login kembali.'));
            });
            return;
        }

        req.peminjam = peminjam.toJSON();
        next();
    } catch (err) {
        console.error('attachUser error:', err);
        req.session.destroy(() => {
            return res.redirect('/login?error=' + encodeURIComponent('Sesi tidak valid. Silakan login kembali.'));
        });
    }
};

/**
 * ensureAuthenticated
 * - Hanya memastikan ada session (cepat reject tanpa DB)
 */
exports.ensureAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.username) {
        return res.redirect('/login');
    }
    next();
};

/**
 * requireRole(allowedRoles)
 * - Harus dipakai setelah attachUser sehingga req.peminjam tersedia
 */
exports.requireRole = (allowedRoles) => {
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return (req, res, next) => {
        if (!req.peminjam || !req.peminjam.status) {
            return res.status(403).send('Akses ditolak.');
        }
        if (!allowed.includes(req.peminjam.status)) {
            // redirect ke dashboard role mereka (lebih ramah daripada 403)
            const role = req.peminjam.status;
            if (role === 'Admin') return res.redirect('/admin/dashboard');
            if (role === 'Anggota') return res.redirect('/anggota/dashboard');
            if (role === 'Non-Anggota') return res.redirect('/nonanggota/dashboard');
            return res.status(403).send('Akses ditolak.');
        }
        next();
    };
};

/**
 * Helper role-specific middleware (gabungan attachUser + requireRole)
 * - Buat pemakaian di routes jadi singkat dan konsisten
 */
exports.adminOnly = [exports.attachUser, exports.requireRole('Admin')];
exports.anggotaOnly = [exports.attachUser, exports.requireRole('Anggota')];
exports.nonAnggotaOnly = [exports.attachUser, exports.requireRole('Non-Anggota')];
