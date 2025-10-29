const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('peminjam', {
    username: {
      type: DataTypes.STRING(25),
      allowNull: false,
      primaryKey: true
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    nama_lengkap: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    alamat: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    no_telpon: {
      type: DataTypes.CHAR(15),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('Admin','Anggota','Non-Anggota'),
      allowNull: false
    },
    tgl_daftar: {
      type: DataTypes.DATEONLY,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'peminjam',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "username" },
        ]
      },
    ]
  });
};
