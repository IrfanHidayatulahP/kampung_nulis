var DataTypes = require("sequelize").DataTypes;
var _barang = require("./barang");
var _detail_transaksi = require("./detail_transaksi");
var _ganti_barang = require("./ganti_barang");
var _pembayaran = require("./pembayaran");
var _peminjam = require("./peminjam");
var _rusak_hilang = require("./rusak_hilang");
var _transaksi_sewa = require("./transaksi_sewa");

function initModels(sequelize) {
  var barang = _barang(sequelize, DataTypes);
  var detail_transaksi = _detail_transaksi(sequelize, DataTypes);
  var ganti_barang = _ganti_barang(sequelize, DataTypes);
  var pembayaran = _pembayaran(sequelize, DataTypes);
  var peminjam = _peminjam(sequelize, DataTypes);
  var rusak_hilang = _rusak_hilang(sequelize, DataTypes);
  var transaksi_sewa = _transaksi_sewa(sequelize, DataTypes);

  detail_transaksi.belongsTo(barang, { as: "id_barang_barang", foreignKey: "id_barang"});
  barang.hasMany(detail_transaksi, { as: "detail_transaksis", foreignKey: "id_barang"});
  ganti_barang.belongsTo(barang, { as: "id_barang_barang", foreignKey: "id_barang"});
  barang.hasMany(ganti_barang, { as: "ganti_barangs", foreignKey: "id_barang"});
  rusak_hilang.belongsTo(detail_transaksi, { as: "id_detail_detail_transaksi", foreignKey: "id_detail"});
  detail_transaksi.hasMany(rusak_hilang, { as: "rusak_hilangs", foreignKey: "id_detail"});
  transaksi_sewa.belongsTo(peminjam, { as: "username_peminjam", foreignKey: "username"});
  peminjam.hasMany(transaksi_sewa, { as: "transaksi_sewas", foreignKey: "username"});
  detail_transaksi.belongsTo(transaksi_sewa, { as: "id_transaksi_transaksi_sewa", foreignKey: "id_transaksi"});
  transaksi_sewa.hasMany(detail_transaksi, { as: "detail_transaksis", foreignKey: "id_transaksi"});
  pembayaran.belongsTo(transaksi_sewa, { as: "id_transaksi_transaksi_sewa", foreignKey: "id_transaksi"});
  transaksi_sewa.hasMany(pembayaran, { as: "pembayarans", foreignKey: "id_transaksi"});

  return {
    barang,
    detail_transaksi,
    ganti_barang,
    pembayaran,
    peminjam,
    rusak_hilang,
    transaksi_sewa,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
