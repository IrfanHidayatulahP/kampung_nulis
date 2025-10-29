// config/db.js
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

const DB_NAME = process.env.DB_NAME || 'database';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
// pastikan parseInt agar port jadi number
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306;
// bila ingin eksplisit, tambahkan DB_DIALECT di .env (default mysql)
const DB_DIALECT = process.env.DB_DIALECT || 'mysql';

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: DB_DIALECT,    // <<< PENTING
    logging: false,
    define: { timestamps: false }
});

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// contoh import model (sesuaikan path model Anda)
const peminjamModel = require('../models/peminjam');
db.peminjam = peminjamModel(sequelize, DataTypes);

// optional: test koneksi saat start (akan mencetak pesan)
(async () => {
    try {
        await sequelize.authenticate();
        console.log(`DB: berhasil terkoneksi ke ${DB_DIALECT}://${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    } catch (err) {
        console.error('DB: gagal koneksi ->', err.message);
    }
})();

module.exports = db;
