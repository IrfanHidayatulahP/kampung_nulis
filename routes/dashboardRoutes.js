// // routes/dashboardRoutes.js
// const express = require('express');
// const { attachUser, requireRole } = require('../middleware/auth');
// const dashboardController = require('../controllers/dashboardController');

// const adminRouter = express.Router();
// const anggotaRouter = express.Router();
// const nonAnggotaRouter = express.Router();

// // Admin routes (attachUser -> requireRole)
// adminRouter.use(attachUser, requireRole('Admin'));
// adminRouter.get('/dashboard', dashboardController.adminDashboard);
// // tambahkan route admin lain dibawah ini (mis. /admin/users, /admin/settings)


// // Anggota routes
// anggotaRouter.use(attachUser, requireRole('Anggota'));
// anggotaRouter.get('/dashboard', dashboardController.anggotaDashboard);
// // tambahkan route anggota lain


// // Non-Anggota routes
// nonAnggotaRouter.use(attachUser, requireRole('Non-Anggota'));
// nonAnggotaRouter.get('/dashboard', dashboardController.nonAnggotaDashboard);

// module.exports = {
//     adminRouter,
//     anggotaRouter,
//     nonAnggotaRouter
// };
