// controllers/dashboardController.js
exports.adminDashboard = (req, res) => {
    const user = req.peminjam || req.session.user || null;
    res.render('admin/dashboard_admin', { user });
};

exports.anggotaDashboard = (req, res) => {
    const user = req.peminjam || req.session.user || null;
    res.render('anggota/dashboard_anggota', { user });
};

exports.nonAnggotaDashboard = (req, res) => {
    const user = req.peminjam || req.session.user || null;
    res.render('nonanggota/dashboard_nonanggota', { user });
};
