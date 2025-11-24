// barangController.js (perbaikan: safe model lookup + better error messages)
const db = require("../config/db");
const { Op } = require("sequelize");

// cari model Barang secara robust
let Barang = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));

// jika tidak ditemukan, log detail supaya mudah debug
if (!Barang) {
    console.error("Model 'Barang' tidak ditemukan pada export db. Keys in db:", Object.keys(db));
}

/** helper: cek ketersediaan model, dan kirim 500 jika tidak ada (untuk route handlers) */
function ensureModelOrRespond(res) {
    if (!Barang) {
        const msg = "Server misconfiguration: model 'Barang' tidak tersedia. Periksa config/db.js";
        console.error(msg);
        if (res && typeof res.status === "function") {
            res.status(500).send(msg);
            return false;
        }
        throw new Error(msg);
    }
    return true;
}

function isValidId(id) {
    if (id == null) return false;
    const n = Number(id);
    return Number.isInteger(n) && n > 0;
}

async function findBarangById(q, useFirst = false) {
    if (!q) return useFirst ? null : [];
    if (!Barang) throw new Error("Model 'Barang' tidak tersedia");

    // jika q adalah angka, cari by PK
    if (isValidId(q)) {
        const rec = await Barang.findByPk(Number(q));
        if (rec) return useFirst ? rec : [rec];
    }

    // fallback: cari nama_barang atau satuan_jumlah menggunakan LIKE
    const like = await Barang.findAll({
        where: {
            [Op.or]: [
                { nama_barang: { [Op.like]: `%${q}%` } },
                { satuan_jumlah: { [Op.like]: `%${q}%` } },
            ],
        },
        order: [["id_barang", "ASC"]],
    });

    return useFirst ? like[0] || null : like;
}

/**
 * showIndex - daftar semua barang (opsional ?q= untuk pencarian nama atau id)
 */
exports.showIndex = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const user = req.session && req.session.user ? req.session.user : null;
        const nama_lengkap = req.session?.user?.nama_lengkap || "";

        const q = (req.query.q || "").toString().trim();
        let records = [];

        if (q) {
            if (isValidId(q)) {
                const r = await Barang.findByPk(Number(q));
                records = r ? [r] : [];
            } else {
                records = await Barang.findAll({
                    where: {
                        [Op.or]: [
                            { id_barang: isNaN(Number(q)) ? 0 : Number(q) },
                            { nama_barang: { [Op.like]: `%${q}%` } },
                            { satuan_jumlah: { [Op.like]: `%${q}%` } },
                        ],
                    },
                    order: [["id_barang", "ASC"]],
                    limit: 1000,
                });
            }
        } else {
            records = await Barang.findAll({
                order: [["id_barang", "ASC"]],
                limit: 1000,
            });
        }

        const recordsPlain = Array.isArray(records)
            ? records.map((r) => (r && typeof r.toJSON === "function" ? r.toJSON() : r))
            : [];

        return res.render("admin/barang/list_barang", {
            records: recordsPlain,
            barang: recordsPlain,
            user: req.user,
            nama_lengkap,
            filter_q: q,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("barang.showIndex error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * showCreateForm - tampilkan form tambah barang
 */
exports.showCreateForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const user = req.session && req.session.user ? req.session.user : null;
        const nama_lengkap = req.session?.user?.nama_lengkap || "";

        const satuanOptions = ["pcs", "box", "kg", "liter"];

        res.render("admin/barang/tambah_barang", {
            satuanOptions,
            user,
            nama_lengkap,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("barang.showCreateForm error:", err);
        res.status(500).send("Server Error");
    }
};

/**
 * create - simpan data baru barang
 * route: POST /barang/create
 */
exports.create = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const { nama_barang, jumlah_total, stok_tersedia, satuan_jumlah, harga_dasar_sewa } = req.body;

        if (!nama_barang || String(nama_barang).trim() === "") {
            await t.rollback();
            return res.redirect("/barang/create?error=" + encodeURIComponent("Nama barang wajib diisi"));
        }

        const jt = Number(jumlah_total);
        const st = Number(stok_tersedia);
        const harga = Number(harga_dasar_sewa);

        if (!Number.isFinite(jt) || jt < 0) {
            await t.rollback();
            return res.redirect("/barang/create?error=" + encodeURIComponent("jumlah_total harus angka >= 0"));
        }
        if (!Number.isFinite(st) || st < 0) {
            await t.rollback();
            return res.redirect("/barang/create?error=" + encodeURIComponent("stok_tersedia harus angka >= 0"));
        }
        if (!Number.isFinite(harga) || harga < 0) {
            await t.rollback();
            return res.redirect("/barang/create?error=" + encodeURIComponent("harga_dasar_sewa harus angka >= 0"));
        }
        if (st > jt) {
            await t.rollback();
            return res.redirect("/barang/create?error=" + encodeURIComponent("stok_tersedia tidak boleh lebih besar dari jumlah_total"));
        }

        const exists = await Barang.findOne({ where: { nama_barang: String(nama_barang).trim() } });
        if (exists) {
            await t.rollback();
            return res.redirect("/barang/create?error=" + encodeURIComponent("Nama barang sudah ada"));
        }

        const payload = {
            nama_barang: String(nama_barang).trim(),
            jumlah_total: jt,
            stok_tersedia: st,
            satuan_jumlah: satuan_jumlah ? String(satuan_jumlah).trim() : null,
            harga_dasar_sewa: harga,
        };

        await Barang.create(payload, { transaction: t });
        await t.commit();

        return res.redirect("/barang/list-barang?success=" + encodeURIComponent("Data barang berhasil ditambahkan"));
    } catch (err) {
        await t.rollback();
        console.error("barang.create error:", err);
        return res.redirect("/barang/create?error=" + encodeURIComponent("Gagal menyimpan data"));
    }
};

/**
 * showEditForm - tampilkan form edit berdasarkan id_barang
 * route: GET /barang/edit/:id
 */
exports.showEditForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.status(400).send("Parameter id tidak valid");

        let record = await Barang.findByPk(Number(id));
        if (!record) record = await findBarangById(id, true);

        if (!record) return res.status(404).send("Data barang tidak ditemukan");

        const user = req.session && req.session.user ? req.session.user : null;
        const nama_lengkap = req.session?.user?.nama_lengkap || "";

        const recordPlain = record && typeof record.toJSON === "function" ? record.toJSON() : record;

        return res.render("admin/barang/edit_barang", {
            barang: recordPlain,
            user,
            nama_lengkap,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("barang.showEditForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * update - update data barang
 * route: POST /barang/edit/:id
 */
exports.update = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id = req.params.id;
        if (!isValidId(id)) {
            await t.rollback();
            return res.status(400).send("ID tidak valid");
        }

        const item = await Barang.findByPk(Number(id));
        if (!item) {
            await t.rollback();
            return res.status(404).send("Barang tidak ditemukan");
        }

        const { nama_barang, jumlah_total, stok_tersedia, satuan_jumlah, harga_dasar_sewa } = req.body;

        if (typeof nama_barang !== "undefined" && String(nama_barang).trim() === "") {
            await t.rollback();
            return res.redirect("/barang/edit/" + id + "?error=" + encodeURIComponent("Nama barang tidak boleh kosong"));
        }

        const jt = typeof jumlah_total !== "undefined" ? Number(jumlah_total) : item.jumlah_total;
        const st = typeof stok_tersedia !== "undefined" ? Number(stok_tersedia) : item.stok_tersedia;
        const harga = typeof harga_dasar_sewa !== "undefined" ? Number(harga_dasar_sewa) : item.harga_dasar_sewa;

        if (!Number.isFinite(jt) || jt < 0) {
            await t.rollback();
            return res.redirect("/barang/edit/" + id + "?error=" + encodeURIComponent("jumlah_total harus angka >= 0"));
        }
        if (!Number.isFinite(st) || st < 0) {
            await t.rollback();
            return res.redirect("/barang/edit/" + id + "?error=" + encodeURIComponent("stok_tersedia harus angka >= 0"));
        }
        if (!Number.isFinite(harga) || harga < 0) {
            await t.rollback();
            return res.redirect("/barang/edit/" + id + "?error=" + encodeURIComponent("harga_dasar_sewa harus angka >= 0"));
        }
        if (st > jt) {
            await t.rollback();
            return res.redirect("/barang/edit/" + id + "?error=" + encodeURIComponent("stok_tersedia tidak boleh lebih besar dari jumlah_total"));
        }

        if (typeof nama_barang !== "undefined" && String(nama_barang).trim() !== item.nama_barang) {
            const exists = await Barang.findOne({ where: { nama_barang: String(nama_barang).trim(), id_barang: { [Op.ne]: item.id_barang } } });
            if (exists) {
                await t.rollback();
                return res.redirect("/barang/edit/" + id + "?error=" + encodeURIComponent("Nama barang sudah digunakan oleh data lain"));
            }
        }

        if (typeof nama_barang !== "undefined") item.nama_barang = String(nama_barang).trim();
        item.jumlah_total = jt;
        item.stok_tersedia = st;
        item.satuan_jumlah = typeof satuan_jumlah !== "undefined" ? (satuan_jumlah === "" ? null : String(satuan_jumlah).trim()) : item.satuan_jumlah;
        item.harga_dasar_sewa = harga;

        await item.save({ transaction: t });
        await t.commit();

        return res.redirect("/barang/list-barang?success=" + encodeURIComponent("Data barang berhasil diupdate"));
    } catch (err) {
        await t.rollback();
        console.error("barang.update error:", err);
        return res.redirect(
            "/barang/edit/" + (req.params.id || "") + "?error=" + encodeURIComponent("Gagal mengupdate data")
        );
    }
};

/**
 * delete - hapus record berdasarkan id
 * route: POST /barang/delete/:id
 */
exports.delete = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id = req.params.id;
        if (!isValidId(id)) {
            await t.rollback();
            return res.status(400).send("ID tidak valid");
        }

        const record = await findBarangById(id, true);
        if (!record) {
            await t.rollback();
            return res.redirect("/barang/list-barang?error=" + encodeURIComponent("Data barang tidak ditemukan"));
        }

        await Barang.destroy({ where: { id_barang: record.id_barang }, transaction: t });
        await t.commit();

        return res.redirect("/barang/list-barang?success=" + encodeURIComponent("Data berhasil dihapus"));
    } catch (err) {
        await t.rollback();
        console.error("barang.delete error:", err);
        return res.redirect("/barang/list-barang?error=" + encodeURIComponent("Gagal menghapus data"));
    }
};

/**
 * showDetail - tampilkan detail barang berdasarkan id
 * route: GET /barang/detail/:id
 */
exports.showDetail = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.redirect("/barang/list-barang?error=" + encodeURIComponent("ID tidak valid"));

        const record = await Barang.findByPk(Number(id));
        if (!record) return res.status(404).send("Data barang tidak ditemukan untuk ID ini");

        const recordPlain = typeof record.toJSON === "function" ? record.toJSON() : record;

        return res.render("admin/barang/detail_barang", {
            barang: recordPlain,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("barang.showDetail error:", err);
        return res.redirect("/barang/list-barang?error=" + encodeURIComponent("Terjadi kesalahan saat mengambil data barang"));
    }
};
