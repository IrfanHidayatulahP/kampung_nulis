// config/db.js  (ganti file lama dengan ini)
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// pastikan env ada; default ke 'development'
const env = process.env.NODE_ENV && process.env.NODE_ENV.trim() !== '' ? process.env.NODE_ENV : 'development';

let configFromFile = {};
try {
    // jika Anda punya config.js yang mengekspor objek keyed by env
    configFromFile = require(path.join(__dirname, 'config.js'))[env] || {};
} catch (e) {
    // jika tidak ada file config.js, lanjut saja (akan fallback ke env vars)
    // console.log('config.js not found or invalid — using environment vars as fallback');
}

// Ambil setting dari file config atau dari environment (fallback)
const DB_NAME = configFromFile.database || process.env.DB_NAME || 'database';
const DB_USER = configFromFile.username || process.env.DB_USER || 'root';
const DB_PASS = configFromFile.password || process.env.DB_PASS || '';
const DB_HOST = configFromFile.host || process.env.DB_HOST || 'localhost';
const DB_PORT = configFromFile.port ? Number(configFromFile.port) : (process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306);
const DB_DIALECT = configFromFile.dialect || process.env.DB_DIALECT || 'mysql';

// Buat instance Sequelize
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: DB_DIALECT,
    logging: false,
    define: { timestamps: false }
});

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Inisialisasi model lewat init-models (jika ada)
try {
    const initModels = require(path.join(__dirname, '..', 'models', 'init-models'));
    const models = initModels(sequelize);
    Object.keys(models).forEach(name => {
        db[name] = models[name];
    });
} catch (err) {
    console.warn('Tidak menemukan init-models, lewati inisialisasi model otomatis. Error:', err.message);
    // Jika Anda memiliki model manual, import di sini, mis:
    // const Barang = require('../models/barang')(sequelize, DataTypes);
    // db.barang = Barang;
}

// Optional: test koneksi saat start (log lebih informatif)
(async () => {
    try {
        await sequelize.authenticate();
        console.log(`DB: berhasil terkoneksi ke ${DB_DIALECT}://${DB_HOST}:${DB_PORT}/${DB_NAME} (env=${env})`);
    } catch (err) {
        console.error('DB: gagal koneksi ->', err.message);
    }
})();

module.exports = db;
