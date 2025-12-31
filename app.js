require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const publicRoutes = require('./routes/publicRoutes');      // <-- tambah ini
const authRoutes = require('./routes/authRoutes');
const peminjamRoutes = require('./routes/peminjamRoutes');
const barangRoutes = require('./routes/barangRoutes');
const transaksiSewaRoutes = require('./routes/transaksiSewaRoutes');
const detailTransaksiRoutes = require('./routes/detailTransaksiRoutes');
const rusakHilangRoutes = require('./routes/rusakHilangRoutes');
const sewaRoutes = require('./routes/sewaRoutes');

const app = express();

// view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// static
app.use(express.static(path.join(__dirname, 'public')));

// pastikan folder public/uploads tersedia di project
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// body parser
app.use(bodyParser.urlencoded({ extended: false }));

// session
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_development',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 jam
}));

// Mount public routes FIRST so '/' will show the public dashboard
app.use('/', publicRoutes);

// Mount auth routes and others
app.use('/', authRoutes);
app.use('/peminjam', peminjamRoutes);
app.use('/barang', barangRoutes);
app.use('/transaksi', transaksiSewaRoutes);
app.use('/detail-transaksi', detailTransaksiRoutes);
app.use('/rusak-hilang', rusakHilangRoutes);
app.use('/sewa', sewaRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).send('Halaman tidak ditemukan');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));

module.exports = app;
