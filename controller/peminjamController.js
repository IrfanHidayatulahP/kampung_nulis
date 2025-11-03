// controllers/peminjamController.js
const db = require("../config/db");
const { Op } = require("sequelize");

const Peminjam = db.peminjam;

// Validasi sederhana username (pk): non-empty string, max 25 chars
function isValidUsername(username) {
    return (
        typeof username === "string" &&
        username.trim().length > 0 &&
        username.trim().length <= 25
    );
}

/**
 * Helper: cari record peminjam berdasarkan username (mengembalikan array atau single jika useFirst=true)
 */
async function findPeminjamByUsername(q, useFirst = false) {
    if (!q || typeof q !== "string") return useFirst ? null : [];
    const plain = q.trim();

    // Exact match on username
    const exact = await Peminjam.findAll({ where: { username: plain } });
    if (exact.length > 0) return useFirst ? exact[0] : exact;

    // Fallback: cari menggunakan LIKE pada username, nama_lengkap, atau no_telpon
    const like = await Peminjam.findAll({
        where: {
            [Op.or]: [
                { username: { [Op.like]: `%${plain}%` } },
                { nama_lengkap: { [Op.like]: `%${plain}%` } },
                { no_telpon: { [Op.like]: `%${plain}%` } },
            ],
        },
    });

    return useFirst ? like[0] || null : like;
}

/**
 * showIndex - daftar semua peminjam
 * Optional: filter by ?q= (username / nama / no_telpon)
 */
exports.showIndex = async (req, res) => {
    try {
        const user = req.session && req.session.user ? req.session.user : null;
        const nama_lengkap = req.session?.user?.nama_lengkap || "";

        const q = (req.query.q || "").toString().trim();

        let records = [];
        if (q) {
            if (isValidUsername(q) && q.length <= 25) {
                records = await Peminjam.findAll({
                    where: { username: q },
                    order: [["username", "ASC"]],
                });
            } else {
                records = await Peminjam.findAll({
                    where: {
                        [Op.or]: [
                            { username: { [Op.like]: `%${q}%` } },
                            { nama_lengkap: { [Op.like]: `%${q}%` } },
                            { no_telpon: { [Op.like]: `%${q}%` } },
                        ],
                    },
                    order: [["username", "ASC"]],
                });
            }
        } else {
            records = await Peminjam.findAll({
                order: [["username", "ASC"]],
                limit: 1000,
            });
        }

        const recordsPlain = Array.isArray(records)
            ? records.map((r) => (r && typeof r.toJSON === "function" ? r.toJSON() : r))
            : [];

        // Hilangkan password sebelum render
        recordsPlain.forEach((r) => {
            if (r && r.password) delete r.password;
        });

        return res.render("admin/peminjam/list_peminjam", {
            records: recordsPlain,
            peminjam: recordsPlain,
            user,
            nama_lengkap,
            filter_q: q,
        });
    } catch (err) {
        console.error("peminjam.showIndex error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * showCreateForm - tampilkan form tambah
 */
exports.showCreateForm = async (req, res) => {
    try {
        const user = req.session && req.session.user ? req.session.user : null;
        const nama_lengkap = req.session?.user?.nama_lengkap || "";

        const statuses = ["Admin", "Anggota", "Non-Anggota"];

        res.render("admin/peminjam/tambah_peminjam", {
            statuses,
            user,
            nama_lengkap,
            error: req.query.error || null,
        });
    } catch (err) {
        console.error("peminjam.showCreateForm error:", err);
        res.status(500).send("Server Error");
    }
};

/**
 * create - simpan data baru peminjam
 * route: POST /peminjam/create
 */
exports.create = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const {
            username,
            password,
            nama_lengkap,
            alamat,
            no_telpon,
            status,
            tgl_daftar,
        } = req.body;

        // Validasi minimal
        if (!username || !isValidUsername(username)) {
            await t.rollback();
            return res.redirect(
                "/peminjam/create?error=" + encodeURIComponent("Username tidak valid atau kosong")
            );
        }
        if (!password || typeof password !== "string" || password.trim().length === 0) {
            await t.rollback();
            return res.redirect(
                "/peminjam/create?error=" + encodeURIComponent("Password harus diisi")
            );
        }
        if (!nama_lengkap || nama_lengkap.trim().length === 0) {
            await t.rollback();
            return res.redirect(
                "/peminjam/create?error=" + encodeURIComponent("Nama lengkap harus diisi")
            );
        }
        if (!status || !["Admin", "Anggota", "Non-Anggota"].includes(status)) {
            await t.rollback();
            return res.redirect(
                "/peminjam/create?error=" + encodeURIComponent("Status tidak valid")
            );
        }
        if (!tgl_daftar) {
            await t.rollback();
            return res.redirect(
                "/peminjam/create?error=" + encodeURIComponent("Tanggal daftar harus diisi")
            );
        }

        // Cek apakah username sudah ada
        const exists = await Peminjam.findByPk(username);
        if (exists) {
            await t.rollback();
            return res.redirect(
                "/peminjam/create?error=" + encodeURIComponent("Username sudah terdaftar")
            );
        }

        const payload = {
            username: String(username).trim(),
            password: String(password), // NOTE: disarankan hash sebelum simpan di produksi
            nama_lengkap: String(nama_lengkap).trim(),
            alamat: alamat ? String(alamat).trim() : null,
            no_telpon: no_telpon ? String(no_telpon).trim() : null,
            status: String(status).trim(),
            tgl_daftar: tgl_daftar,
        };

        await Peminjam.create(payload, { transaction: t });
        await t.commit();

        return res.redirect(
            "/peminjam/list-peminjam?success=" + encodeURIComponent("Data peminjam berhasil ditambahkan")
        );
    } catch (err) {
        await t.rollback();
        console.error("peminjam.create error:", err);
        return res.redirect(
            "/peminjam/create?error=" + encodeURIComponent("Gagal menyimpan data")
        );
    }
};

/**
 * showEditForm - tampilkan form edit berdasarkan username
 * route: GET /peminjam/edit/:username
 */
exports.showEditForm = async (req, res) => {
    try {
        const username = req.params.username;
        if (!username) return res.status(400).send("Parameter username tidak valid");

        let record = await Peminjam.findByPk(username);
        if (!record) record = await findPeminjamByUsername(username, true);

        if (!record) return res.status(404).send("Data peminjam tidak ditemukan");

        const user = req.session && req.session.user ? req.session.user : null;
        const nama_lengkap = req.session?.user?.nama_lengkap || "";

        const recordPlain =
            record && typeof record.toJSON === "function" ? record.toJSON() : record;

        if (recordPlain.password) delete recordPlain.password;

        return res.render("admin/peminjam/edit_peminjam", {
            peminjam: recordPlain,
            user,
            nama_lengkap,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("peminjam.showEditForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * update - update berdasarkan username (route: POST /peminjam/edit/:username)
 */
exports.update = async (req, res) => {
    try {
        const username = req.params.username;
        if (!isValidUsername(username)) return res.status(400).send("Username tidak valid");

        const {
            password,
            nama_lengkap,
            alamat,
            no_telpon,
            status,
            tgl_daftar,
        } = req.body;

        const item = await Peminjam.findByPk(username);
        if (!item) return res.status(404).send("Peminjam tidak ditemukan");

        if (typeof password !== "undefined" && password !== null && String(password).trim() !== "") {
            item.password = String(password); // NOTE: hash di produksi
        }

        const updatable = ["nama_lengkap", "alamat", "no_telpon", "status", "tgl_daftar"];
        updatable.forEach((f) => {
            if (typeof req.body[f] !== "undefined") item[f] = req.body[f] === "" ? null : req.body[f];
        });

        await item.save();

        return res.redirect("/peminjam/list-peminjam?success=Data peminjam berhasil diupdate");
    } catch (err) {
        console.error("peminjam.update error:", err);
        return res.render("admin/peminjam/edit_peminjam", {
            title: "Edit Peminjam",
            peminjam: req.body,
            error: "Gagal mengupdate data",
        });
    }
};

/**
 * delete - hapus record berdasarkan username
 * route: POST /peminjam/delete/:username
 */
exports.delete = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const username = req.params.username;
        if (!username || typeof username !== "string") {
            await t.rollback();
            return res.status(400).send("Parameter tidak valid");
        }

        const record = await findPeminjamByUsername(username, true);
        if (!record) {
            await t.rollback();
            return res.status(404).send("Data peminjam tidak ditemukan");
        }

        await Peminjam.destroy({ where: { username: record.username }, transaction: t });
        await t.commit();

        return res.redirect("/peminjam/list-peminjam?success=" + encodeURIComponent("Data berhasil dihapus"));
    } catch (err) {
        await t.rollback();
        console.error("peminjam.delete error:", err);
        return res.redirect("/peminjam/list-peminjam?error=" + encodeURIComponent("Gagal menghapus data"));
    }
};

/**
 * showDetail - tampilkan detail berdasarkan username
 * route: GET /peminjam/detail/:username
 */
exports.showDetail = async (req, res) => {
    try {
        const username = req.params.username;
        if (!username || typeof username !== "string") {
            return res.redirect("/?error=" + encodeURIComponent("Username tidak valid"));
        }

        const record = await Peminjam.findByPk(username);
        if (!record) return res.status(404).send("Data peminjam tidak ditemukan untuk username ini");

        const recordPlain = typeof record.toJSON === "function" ? record.toJSON() : record;
        if (recordPlain.password) delete recordPlain.password;

        return res.render("admin/peminjam/detail_peminjam", {
            peminjam: recordPlain,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("peminjam.showDetail error:", err);
        return res.redirect("/?error=" + encodeURIComponent("Terjadi kesalahan saat mengambil data peminjam"));
    }
};
