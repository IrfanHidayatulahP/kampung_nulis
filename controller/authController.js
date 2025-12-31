// controllers/authController.js
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROLE_ROUTES = {
    'Admin': '/admin/dashboard_admin',
    'Anggota': '/anggota/dashboard_anggota',
    'Non-Anggota': '/anggota/dashboard_anggota' // sama dashboard
};

exports.showLogin = (req, res) => {
    const error = req.query.error || null;
    const success = req.query.success || null;
    const old = { username: req.query.username || '' };
    res.render('auth/login', { error, success, old });
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.redirect('/login?error=' + encodeURIComponent('Username dan password wajib') + '&username=' + encodeURIComponent(username || ''));
        }

        const peminjam = await db.peminjam.findByPk(username);
        if (!peminjam) {
            return res.redirect('/login?error=' + encodeURIComponent('Username atau password salah') + '&username=' + encodeURIComponent(username));
        }

        const match = await bcrypt.compare(password, peminjam.password);
        if (!match) {
            return res.redirect('/login?error=' + encodeURIComponent('Username atau password salah') + '&username=' + encodeURIComponent(username));
        }

        // set session
        req.session.username = peminjam.username;
        req.session.user = {
            username: peminjam.username,
            nama_lengkap: peminjam.nama_lengkap,
            status: peminjam.status
        };

        const target = ROLE_ROUTES[peminjam.status] || '/dashboard';
        return res.redirect(target);
    } catch (err) {
        console.error('Login error:', err);
        return res.redirect('/login?error=' + encodeURIComponent('Terjadi kesalahan. Coba lagi.'));
    }
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            res.clearCookie('connect.sid');
            return res.redirect('/login?error=' + encodeURIComponent('Gagal logout. Silakan coba lagi.'));
        }
        res.clearCookie('connect.sid');
        res.redirect('/login?success=' + encodeURIComponent('Anda telah logout.'));
    });
};

/* ---------- REGISTER ---------- */
exports.showRegister = (req, res) => {
    const error = req.query.error || null;
    const old = {
        username: req.query.username || '',
        nama_lengkap: req.query.nama_lengkap || '',
        alamat: req.query.alamat || '',
        no_telpon: req.query.no_telpon || ''
    };
    res.render('auth/register', { error, old });
};

exports.register = async (req, res) => {
    try {
        const { username, password, confirm_password, nama_lengkap, alamat, no_telpon } = req.body;

        // basic validation
        if (!username || !password || !confirm_password || !nama_lengkap) {
            return res.redirect('/register?error=' + encodeURIComponent('Lengkapi semua field yang wajib') +
                `&username=${encodeURIComponent(username || '')}&nama_lengkap=${encodeURIComponent(nama_lengkap || '')}`);
        }

        if (password.length < 6) {
            return res.redirect('/register?error=' + encodeURIComponent('Password minimal 6 karakter') +
                `&username=${encodeURIComponent(username || '')}&nama_lengkap=${encodeURIComponent(nama_lengkap || '')}`);
        }

        if (password !== confirm_password) {
            return res.redirect('/register?error=' + encodeURIComponent('Konfirmasi password tidak cocok') +
                `&username=${encodeURIComponent(username || '')}&nama_lengkap=${encodeURIComponent(nama_lengkap || '')}`);
        }

        // cek apakah username sudah ada
        const existing = await db.peminjam.findByPk(username);
        if (existing) {
            return res.redirect('/register?error=' + encodeURIComponent('Username sudah dipakai') +
                `&username=${encodeURIComponent('')}&nama_lengkap=${encodeURIComponent(nama_lengkap || '')}`);
        }

        // hash password
        const hash = await bcrypt.hash(password, 10);

        // buat record baru - default status = 'Non-Anggota'
        await db.peminjam.create({
            username,
            password: hash,
            nama_lengkap,
            alamat: alamat || null,
            no_telpon: no_telpon || null,
            status: 'Non-Anggota',
            tgl_daftar: new Date() // DATEONLY akan menyimpan tanggal saja
        });

        // sukses -> kembali ke login dengan pesan sukses
        return res.redirect('/login?success=' + encodeURIComponent('Pendaftaran berhasil. Silakan login.') + '&username=' + encodeURIComponent(username));
    } catch (err) {
        console.error('Register error:', err);
        return res.redirect('/register?error=' + encodeURIComponent('Terjadi kesalahan saat mendaftar. Coba lagi.'));
    }
};
