const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('rusak_hilang', {
    id_rusak_hilang: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    id_detail: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'detail_transaksi',
        key: 'id_detail'
      }
    },
    jumlah_rusak: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    jumlah_hilang: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    biaya_denda_per_item: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    subtotal_denda: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'rusak_hilang',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id_rusak_hilang" },
        ]
      },
      {
        name: "id_detail",
        using: "BTREE",
        fields: [
          { name: "id_detail" },
        ]
      },
    ]
  });
};
