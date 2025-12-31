const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('transaksi_sewa', {
    id_transaksi: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING(25),
      allowNull: true,
      references: {
        model: 'peminjam',
        key: 'username'
      }
    },
    tgl_sewa: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    tgl_pengembalian: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    status_transaksi: {
      type: DataTypes.ENUM('aktif','terlambat','selesai','draft'),
      allowNull: false
    },
    total_biaya_sewa: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    total_dp: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'transaksi_sewa',
    hasTrigger: true,
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id_transaksi" },
        ]
      },
      {
        name: "username",
        using: "BTREE",
        fields: [
          { name: "username" },
        ]
      },
    ]
  });
};
