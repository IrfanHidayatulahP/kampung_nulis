const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('detail_transaksi', {
    id_detail: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    id_transaksi: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'transaksi_sewa',
        key: 'id_transaksi'
      }
    },
    id_barang: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'barang',
        key: 'id_barang'
      }
    },
    jumlah_sewa: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    qty_kembali_bagus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    harga_sewa_per_satuan: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    total_harga_sewa: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'detail_transaksi',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id_detail" },
        ]
      },
      {
        name: "id_transaksi",
        using: "BTREE",
        fields: [
          { name: "id_transaksi" },
        ]
      },
      {
        name: "id_barang",
        using: "BTREE",
        fields: [
          { name: "id_barang" },
        ]
      },
    ]
  });
};
