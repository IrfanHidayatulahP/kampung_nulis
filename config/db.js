// config/db.js
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');

function tryLoadConfig() {
    const candidates = [
        path.join(__dirname, '..', 'config'),     // require('../config')
        path.join(__dirname, '..', 'config.js'),  // require('../config.js')
        path.join(__dirname, 'config.js')         // require('./config.js') if placed here
    ];

    for (const p of candidates) {
        try {
            const required = require(p);
            if (required && typeof required === 'object') {
                // if config exported as { development: {...}, production: {...} }
                if (required[process.env.NODE_ENV || 'development']) {
                    return required[process.env.NODE_ENV || 'development'];
                }
                return required;
            }
        } catch (e) {
        }
    }

    return null;
}

const cfg = tryLoadConfig();

let dbName, dbUser, dbPass, dbHost, dbPort, dbDialect, logging;

if (cfg && typeof cfg === 'object' && (cfg.database || cfg.username || cfg.host)) {
    // use cfg values (Sequelize-CLI style or direct object)
    dbName = cfg.database;
    dbUser = cfg.username;
    dbPass = cfg.password;
    dbHost = cfg.host || process.env.DB_HOST || 'localhost';
    dbPort = cfg.port ? parseInt(cfg.port, 10) : (process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306);
    dbDialect = cfg.dialect || process.env.DB_DIALECT || 'mysql';
    logging = typeof cfg.logging !== 'undefined' ? cfg.logging : false;
} else {
    // fallback to environment variables
    dbName = process.env.DB_NAME || 'database';
    dbUser = process.env.DB_USER || 'root';
    dbPass = process.env.DB_PASS || '';
    dbHost = process.env.DB_HOST || 'localhost';
    dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3300;
    dbDialect = process.env.DB_DIALECT || 'mysql';
    logging = process.env.DB_LOGGING === 'true' ? console.log : false;
}

if (!dbDialect) dbDialect = 'mysql';

// Create sequelize instance
const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: dbDialect,
    logging,
    define: { timestamps: false }
});

const db = { Sequelize, sequelize, DataTypes };

try {
    // jika models berada di folder ../models dan model diexport sebagai function (sequelize, DataTypes)
    db.peminjam = require(path.join(__dirname, '..', 'models', 'peminjam'))(sequelize, DataTypes);
} catch (err) {
    console.warn('Peringatan: gagal import model peminjam otomatis. Periksa path models/peminjam.js.\n', err.message);
}

// (async () => {
//     try {
//         await sequelize.authenticate();
//         console.log(`DB: terkoneksi ke ${dbDialect}://${dbHost}:${dbPort}/${dbName}`);
//     } catch (err) {
//         console.error('DB: gagal koneksi ->', err.message);
//     }
// })();

module.exports = db;
