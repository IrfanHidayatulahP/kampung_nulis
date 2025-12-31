const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('barang', {
    id_barang: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    nama_barang: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: "nama_barang"
    },
    jumlah_total: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    stok_tersedia: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    satuan_jumlah: {
      type: DataTypes.STRING(25),
      allowNull: true
    },
    harga_dasar_sewa: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    photo_path: {
      type: DataTypes.STRING(255),
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'barang',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id_barang" },
        ]
      },
      {
        name: "nama_barang",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "nama_barang" },
        ]
      },
    ]
  });
};
