const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('pembayaran', {
    id_pembayaran: {
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
    jumlah_bayar: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tipe_pembayaran: {
      type: DataTypes.ENUM('DP','Pelunasan Sewa','Denda'),
      allowNull: false
    },
    tanggal_bayar: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'pembayaran',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id_pembayaran" },
        ]
      },
      {
        name: "id_transaksi",
        using: "BTREE",
        fields: [
          { name: "id_transaksi" },
        ]
      },
    ]
  });
};
