// app.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const authRoutes = require('./routes/authRoutes');

const app = express();

// view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// static
app.use(express.static(path.join(__dirname, 'public')));

// body parser
app.use(bodyParser.urlencoded({ extended: false }));

// session
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_development', // ganti di .env
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 jam
}));

// Mount auth routes
app.use('/', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server berjalan di http://localhost:${PORT}`));

module.exports = app;