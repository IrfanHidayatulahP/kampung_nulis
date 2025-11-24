// controller/detailTransaksiController.js
const db = require("../config/db");
const { Op } = require("sequelize");

// safe lookup model (coba beberapa variasi nama property)
let Detail = db.detail_transaksi || db.detailTransaksi || db.Detail_transaksi || db.DetailTransaksi || (db.models && (db.models.detail_transaksi || db.models.Detail_transaksi));
let Transaksi = db.transaksi_sewa || db.transaksiSewa || db.Transaksi_sewa || (db.models && (db.models.transaksi_sewa || db.models.Transaksi_sewa));
let Barang = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));

if (!Detail) {
    console.error("Model 'detail_transaksi' tidak ditemukan pada export db. Keys in db:", Object.keys(db));
}

function ensureModelOrRespond(res) {
    if (!Detail) {
        const msg = "Server misconfiguration: model 'detail_transaksi' tidak tersedia. Periksa config/db.js";
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

/** find detail by id helper */
async function findDetailById(id) {
    if (!Detail) throw new Error("Model 'detail_transaksi' tidak tersedia");
    if (!isValidId(id)) return null;
    return await Detail.findByPk(Number(id));
}

/** index: list semua detail transaksi, optional q untuk cari by id_transaksi atau id_barang */
exports.showIndex = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const q = (req.query.q || "").toString().trim();
        let records = [];

        if (q) {
            if (isValidId(q)) {
                const r = await Detail.findAll({
                    where: {
                        [Op.or]: [
                            { id_detail: Number(q) },
                            { id_transaksi: Number(q) },
                            { id_barang: Number(q) },
                        ]
                    },
                    order: [["id_detail", "DESC"]],
                    limit: 1000
                });
                records = r;
            } else {
                // non numeric search (tidak umum untuk detail)
                records = await Detail.findAll({
                    order: [["id_detail", "DESC"]],
                    limit: 1000
                });
            }
        } else {
            records = await Detail.findAll({
                order: [["id_detail", "DESC"]],
                limit: 1000
            });
        }

        const recordsPlain = Array.isArray(records) ? records.map(r => (r && typeof r.toJSON === "function" ? r.toJSON() : r)) : [];

        return res.render("admin/detail_transaksi/list_detail_transaksi", {
            records: recordsPlain,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            filter_q: q,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("detail.showIndex error:", err);
        return res.status(500).send("Server Error");
    }
};

/** showCreateForm */
exports.showCreateForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        // ambil list transaksi dan barang untuk select
        let transaksiOptions = [];
        if (Transaksi) {
            const all = await Transaksi.findAll({ order: [["id_transaksi", "DESC"]], limit: 1000 });
            transaksiOptions = all.map(t => (t && typeof t.toJSON === "function" ? t.toJSON() : t));
        }

        let barangOptions = [];
        if (Barang) {
            const all = await Barang.findAll({ order: [["nama_barang", "ASC"]], limit: 1000 });
            barangOptions = all.map(b => (b && typeof b.toJSON === "function" ? b.toJSON() : b));
        }

        res.render("admin/detail_transaksi/tambah_detail_transaksi", {
            transaksiOptions,
            barangOptions,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("detail.showCreateForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/** create */
exports.create = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const { id_transaksi, id_barang, jumlah_sewa, harga_sewa_per_satuan, total_harga_sewa } = req.body;

        // validasi dasar
        if (!id_transaksi || !isValidId(id_transaksi)) {
            await t.rollback();
            return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("id_transaksi tidak valid"));
        }
        if (!id_barang || !isValidId(id_barang)) {
            await t.rollback();
            return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("id_barang tidak valid"));
        }
        const js = Number(jumlah_sewa);
        const harga = Number(harga_sewa_per_satuan);
        let total = typeof total_harga_sewa !== "undefined" && total_harga_sewa !== "" ? Number(total_harga_sewa) : null;

        if (!Number.isFinite(js) || js <= 0) {
            await t.rollback();
            return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("jumlah_sewa harus angka > 0"));
        }
        if (!Number.isFinite(harga) || harga < 0) {
            await t.rollback();
            return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("harga_sewa_per_satuan harus angka >= 0"));
        }
        if (total === null) total = js * harga;
        if (!Number.isFinite(total) || total < 0) {
            await t.rollback();
            return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("total_harga_sewa tidak valid"));
        }

        // cek ketersediaan transaksi dan barang (opsional)
        if (Transaksi) {
            const tx = await Transaksi.findByPk(Number(id_transaksi));
            if (!tx) {
                await t.rollback();
                return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
            }
        }
        if (Barang) {
            const br = await Barang.findByPk(Number(id_barang));
            if (!br) {
                await t.rollback();
                return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("Barang tidak ditemukan"));
            }
        }

        const payload = {
            id_transaksi: Number(id_transaksi),
            id_barang: Number(id_barang),
            jumlah_sewa: js,
            qty_kembali_bagus: 0,
            harga_sewa_per_satuan: harga,
            total_harga_sewa: total,
        };

        await Detail.create(payload, { transaction: t });
        await t.commit();

        return res.redirect("/detail-transaksi/list-detail?success=" + encodeURIComponent("Detail transaksi berhasil ditambahkan"));
    } catch (err) {
        await t.rollback();
        console.error("detail.create error:", err);
        return res.redirect("/detail-transaksi/create?error=" + encodeURIComponent("Gagal menyimpan detail transaksi"));
    }
};

/** showEditForm */
exports.showEditForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.status(400).send("Parameter id tidak valid");

        const record = await findDetailById(id);
        if (!record) return res.status(404).send("Data detail transaksi tidak ditemukan");

        const recordPlain = typeof record.toJSON === "function" ? record.toJSON() : record;

        // ambil opsi transaksi & barang
        let transaksiOptions = [];
        if (Transaksi) {
            const all = await Transaksi.findAll({ order: [["id_transaksi", "DESC"]], limit: 1000 });
            transaksiOptions = all.map(t => (t && typeof t.toJSON === "function" ? t.toJSON() : t));
        }

        let barangOptions = [];
        if (Barang) {
            const all = await Barang.findAll({ order: [["nama_barang", "ASC"]], limit: 1000 });
            barangOptions = all.map(b => (b && typeof b.toJSON === "function" ? b.toJSON() : b));
        }

        return res.render("admin/detail_transaksi/edit_detail_transaksi", {
            detail: recordPlain,
            transaksiOptions,
            barangOptions,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("detail.showEditForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/** update */
exports.update = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id = req.params.id;
        if (!isValidId(id)) {
            await t.rollback();
            return res.status(400).send("ID tidak valid");
        }

        const item = await Detail.findByPk(Number(id));
        if (!item) {
            await t.rollback();
            return res.status(404).send("Detail transaksi tidak ditemukan");
        }

        const { id_transaksi, id_barang, jumlah_sewa, qty_kembali_bagus, harga_sewa_per_satuan, total_harga_sewa } = req.body;

        if (typeof id_transaksi !== "undefined" && !isValidId(id_transaksi)) {
            await t.rollback();
            return res.redirect("/detail-transaksi/edit/" + id + "?error=" + encodeURIComponent("id_transaksi tidak valid"));
        }
        if (typeof id_barang !== "undefined" && !isValidId(id_barang)) {
            await t.rollback();
            return res.redirect("/detail-transaksi/edit/" + id + "?error=" + encodeURIComponent("id_barang tidak valid"));
        }

        const js = typeof jumlah_sewa !== "undefined" ? Number(jumlah_sewa) : item.jumlah_sewa;
        const qtyK = typeof qty_kembali_bagus !== "undefined" ? Number(qty_kembali_bagus) : item.qty_kembali_bagus || 0;
        const harga = typeof harga_sewa_per_satuan !== "undefined" ? Number(harga_sewa_per_satuan) : item.harga_sewa_per_satuan;
        let total = typeof total_harga_sewa !== "undefined" ? (total_harga_sewa === "" ? null : Number(total_harga_sewa)) : item.total_harga_sewa;

        if (!Number.isFinite(js) || js <= 0) {
            await t.rollback();
            return res.redirect("/detail-transaksi/edit/" + id + "?error=" + encodeURIComponent("jumlah_sewa harus angka > 0"));
        }
        if (!Number.isFinite(harga) || harga < 0) {
            await t.rollback();
            return res.redirect("/detail-transaksi/edit/" + id + "?error=" + encodeURIComponent("harga_sewa_per_satuan harus angka >= 0"));
        }
        if (total === null) total = js * harga;
        if (!Number.isFinite(total) || total < 0) {
            await t.rollback();
            return res.redirect("/detail-transaksi/edit/" + id + "?error=" + encodeURIComponent("total_harga_sewa tidak valid"));
        }

        // optional cek eksistensi foreign keys
        if (Transaksi && typeof id_transaksi !== "undefined") {
            const tx = await Transaksi.findByPk(Number(id_transaksi));
            if (!tx) {
                await t.rollback();
                return res.redirect("/detail-transaksi/edit/" + id + "?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
            }
        }
        if (Barang && typeof id_barang !== "undefined") {
            const br = await Barang.findByPk(Number(id_barang));
            if (!br) {
                await t.rollback();
                return res.redirect("/detail-transaksi/edit/" + id + "?error=" + encodeURIComponent("Barang tidak ditemukan"));
            }
        }

        if (typeof id_transaksi !== "undefined") item.id_transaksi = Number(id_transaksi);
        if (typeof id_barang !== "undefined") item.id_barang = Number(id_barang);
        item.jumlah_sewa = js;
        item.qty_kembali_bagus = qtyK;
        item.harga_sewa_per_satuan = harga;
        item.total_harga_sewa = total;

        await item.save({ transaction: t });
        await t.commit();
        return res.redirect("/detail-transaksi/list-detail?success=" + encodeURIComponent("Detail transaksi berhasil diupdate"));
    } catch (err) {
        await t.rollback();
        console.error("detail.update error:", err);
        return res.redirect("/detail-transaksi/edit/" + (req.params.id || "") + "?error=" + encodeURIComponent("Gagal mengupdate detail transaksi"));
    }
};

/** delete */
exports.delete = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id = req.params.id;
        if (!isValidId(id)) {
            await t.rollback();
            return res.status(400).send("ID tidak valid");
        }

        const record = await Detail.findByPk(Number(id));
        if (!record) {
            await t.rollback();
            return res.redirect("/detail-transaksi/list-detail?error=" + encodeURIComponent("Data detail transaksi tidak ditemukan"));
        }

        await Detail.destroy({ where: { id_detail: record.id_detail }, transaction: t });
        await t.commit();
        return res.redirect("/detail-transaksi/list-detail?success=" + encodeURIComponent("Detail transaksi berhasil dihapus"));
    } catch (err) {
        await t.rollback();
        console.error("detail.delete error:", err);
        return res.redirect("/detail-transaksi/list-detail?error=" + encodeURIComponent("Gagal menghapus detail transaksi"));
    }
};

/** showDetail */
exports.showDetail = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.redirect("/detail-transaksi/list-detail?error=" + encodeURIComponent("ID tidak valid"));

        const record = await Detail.findByPk(Number(id));
        if (!record) return res.status(404).send("Data detail transaksi tidak ditemukan untuk ID ini");

        const recordPlain = typeof record.toJSON === "function" ? record.toJSON() : record;

        // --- ambil opsi transaksi & barang supaya template yang reuse select tidak error ---
        let transaksiOptions = [];
        if (Transaksi) {
            const allTx = await Transaksi.findAll({ order: [["id_transaksi", "DESC"]], limit: 1000 });
            transaksiOptions = allTx.map(t => (t && typeof t.toJSON === "function" ? t.toJSON() : t));
        }

        let barangOptions = [];
        if (Barang) {
            const allBr = await Barang.findAll({ order: [["nama_barang", "ASC"]], limit: 1000 });
            barangOptions = allBr.map(b => (b && typeof b.toJSON === "function" ? b.toJSON() : b));
        }

        return res.render("admin/detail_transaksi/detail_detail_transaksi", {
            detail: recordPlain,
            transaksiOptions,
            barangOptions,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("detail.showDetail error:", err);
        return res.redirect("/detail-transaksi/list-detail?error=" + encodeURIComponent("Terjadi kesalahan saat mengambil data detail transaksi"));
    }
};