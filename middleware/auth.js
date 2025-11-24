// middleware/auth.js
const db = require('../config/db');

const ROLE_ROUTES = {
    'Admin': '/admin/dashboard_admin',
    'Anggota': '/anggota/dashboard_anggota',
    'Non-Anggota': '/nonanggota/dashboard_nonanggota'
};

/**
 * attachUser
 * - Pastikan ada session.username (sebelumnya Anda melakukan redirect ke /login jika tidak ada)
 * - Ambil data user dari DB dan set req.peminjam (tanpa password)
 * - Set res.locals.user dan res.locals.dashboardRoute agar template bisa langsung menggunakannya
 */
exports.attachUser = async (req, res, next) => {
    try {
        // default untuk template
        res.locals.user = null;
        res.locals.dashboardRoute = '/login';

        if (!req.session || !req.session.username) {
            // tidak ada session: redirect ke login (sama perilaku lama)
            return res.redirect('/login');
        }

        const peminjam = await db.peminjam.findByPk(req.session.username, {
            attributes: ['username', 'nama_lengkap', 'status', 'alamat', 'no_telpon', 'tgl_daftar']
        });

        if (!peminjam) {
            // user di session tidak ditemukan di DB -> bersihkan session dan redirect ke login
            req.session.destroy(err => {
                if (err) console.error('Error destroying session:', err);
                return res.redirect('/login?error=' + encodeURIComponent('Pengguna tidak ditemukan. Silakan login kembali.'));
            });
            return;
        }

        // set object user tanpa password
        req.peminjam = peminjam.toJSON();
        res.locals.user = req.peminjam;

        // tentukan dashboard route berdasarkan status (fallback ke /login jika unknown)
        const status = req.peminjam.status;
        res.locals.dashboardRoute = ROLE_ROUTES[status] || '/login';

        next();
    } catch (err) {
        console.error('attachUser error:', err);
        // bila error: destroy session dan redirect ke login
        req.session.destroy(() => {
            return res.redirect('/login?error=' + encodeURIComponent('Sesi tidak valid. Silakan login kembali.'));
        });
    }
};

/**
 * ensureAuthenticated
 * - Hanya memastikan ada session (cepat reject tanpa DB)
 * - Tidak mengubah res.locals (untuk konsistensi)
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
 * - Jika role tidak sesuai, redirect ke dashboard role mereka (lebih ramah daripada 403)
 */
exports.requireRole = (allowedRoles) => {
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return (req, res, next) => {
        if (!req.peminjam || !req.peminjam.status) {
            // jika attachUser tidak dipanggil sebelumnya, tolak dan arahkan ke login
            return res.redirect('/login');
        }

        const role = req.peminjam.status;
        if (!allowed.includes(role)) {
            // redirect ke dashboard yang sesuai role mereka
            const target = ROLE_ROUTES[role] || '/dashboard';
            return res.redirect(target);
        }

        next();
    };
};

/**
 * Helper role-specific middleware (gabungan attachUser + requireRole)
 * - Memudahkan penggunaan di routes (anda pakai ...adminOnly dll)
 */
exports.adminOnly = [exports.attachUser, exports.requireRole('Admin')];
exports.anggotaOnly = [exports.attachUser, exports.requireRole('Anggota')];
exports.nonAnggotaOnly = [exports.attachUser, exports.requireRole('Non-Anggota')];
