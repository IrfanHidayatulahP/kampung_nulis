const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('ganti_barang', {
    id_ganti: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    id_barang: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'barang',
        key: 'id_barang'
      }
    },
    harga_ganti_barang: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'ganti_barang',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id_ganti" },
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
