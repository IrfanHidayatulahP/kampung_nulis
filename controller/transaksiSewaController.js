// controller/transaksiSewaController.js
const db = require("../config/db");
const { Op } = require("sequelize");

// safe lookup model (sesuaikan nama properti kalau berbeda)
let Transaksi = db.transaksi_sewa || db.transaksiSewa || db.Transaksi_sewa || db.TransaksiSewa || (db.models && (db.models.transaksi_sewa || db.models.Transaksi_sewa));
let Peminjam = db.peminjam || db.Peminjam || (db.models && (db.models.peminjam || db.models.Peminjam));

if (!Transaksi) {
    console.error("Model 'transaksi_sewa' tidak ditemukan pada export db. Keys in db:", Object.keys(db));
}

function ensureModelOrRespond(res) {
    if (!Transaksi) {
        const msg = "Server misconfiguration: model 'transaksi_sewa' tidak tersedia. Periksa config/db.js";
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

/** index - list semua transaksi, optional q untuk search by id or username */
exports.showIndex = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const q = (req.query.q || "").toString().trim();
        let records = [];

        if (q) {
            if (isValidId(q)) {
                const r = await Transaksi.findByPk(Number(q));
                records = r ? [r] : [];
            } else {
                records = await Transaksi.findAll({
                    where: {
                        [Op.or]: [
                            { id_transaksi: isNaN(Number(q)) ? 0 : Number(q) },
                            { username: { [Op.like]: `%${q}%` } },
                            { status_transaksi: { [Op.like]: `%${q}%` } },
                        ],
                    },
                    order: [["id_transaksi", "DESC"]],
                    limit: 1000,
                });
            }
        } else {
            records = await Transaksi.findAll({
                order: [["id_transaksi", "DESC"]],
                limit: 1000,
            });
        }

        const recordsPlain = Array.isArray(records)
            ? records.map(r => (r && typeof r.toJSON === "function" ? r.toJSON() : r))
            : [];

        return res.render("admin/transaksi/list_transaksi", {
            records: recordsPlain,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            filter_q: q,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("transaksi.showIndex error:", err);
        return res.status(500).send("Server Error");
    }
};

/** showCreateForm - tampilkan form tambah transaksi */
exports.showCreateForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        // jika tersedia, ambil daftar peminjam untuk select
        let peminjamOptions = [];
        if (Peminjam) {
            const all = await Peminjam.findAll({ order: [["username", "ASC"]], limit: 1000 });
            peminjamOptions = all.map(p => (p && typeof p.toJSON === "function" ? p.toJSON() : p));
        }

        const statusOptions = ["aktif", "terlambat", "selesai"];

        return res.render("admin/transaksi/tambah_transaksi", {
            peminjamOptions,
            statusOptions,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("transaksi.showCreateForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/** create - simpan transaksi baru */
exports.create = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const { username, tgl_sewa, tgl_pengembalian, status_transaksi, total_biaya_sewa, total_dp } = req.body;

        if (!username || String(username).trim() === "") {
            await t.rollback();
            return res.redirect("/transaksi/create?error=" + encodeURIComponent("Username wajib diisi"));
        }
        if (!tgl_sewa || String(tgl_sewa).trim() === "") {
            await t.rollback();
            return res.redirect("/transaksi/create?error=" + encodeURIComponent("Tanggal sewa wajib diisi"));
        }
        if (!status_transaksi || !["aktif", "terlambat", "selesai"].includes(status_transaksi)) {
            await t.rollback();
            return res.redirect("/transaksi/create?error=" + encodeURIComponent("Status transaksi tidak valid"));
        }

        const total = total_biaya_sewa ? Number(total_biaya_sewa) : null;
        const dp = total_dp ? Number(total_dp) : null;
        if (total !== null && (!Number.isFinite(total) || total < 0)) {
            await t.rollback();
            return res.redirect("/transaksi/create?error=" + encodeURIComponent("total_biaya_sewa harus angka >= 0"));
        }
        if (dp !== null && (!Number.isFinite(dp) || dp < 0)) {
            await t.rollback();
            return res.redirect("/transaksi/create?error=" + encodeURIComponent("total_dp harus angka >= 0"));
        }

        // optional: cek apakah username ada di tabel peminjam jika model tersedia
        if (Peminjam) {
            const pem = await Peminjam.findOne({ where: { username: String(username).trim() } });
            if (!pem) {
                await t.rollback();
                return res.redirect("/transaksi/create?error=" + encodeURIComponent("Username peminjam tidak ditemukan"));
            }
        }

        const payload = {
            username: String(username).trim(),
            tgl_sewa: tgl_sewa,
            tgl_pengembalian: tgl_pengembalian || null,
            status_transaksi,
            total_biaya_sewa: total,
            total_dp: dp,
        };

        await Transaksi.create(payload, { transaction: t });
        await t.commit();
        return res.redirect("/transaksi/list-transaksi?success=" + encodeURIComponent("Transaksi berhasil ditambahkan"));
    } catch (err) {
        await t.rollback();
        console.error("transaksi.create error:", err);
        return res.redirect("/transaksi/create?error=" + encodeURIComponent("Gagal menyimpan data transaksi"));
    }
};

/** showEditForm - tampilkan form edit berdasarkan id_transaksi */
exports.showEditForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.status(400).send("Parameter id tidak valid");

        let record = await Transaksi.findByPk(Number(id));
        if (!record) return res.status(404).send("Data transaksi tidak ditemukan");

        const recordPlain = record && typeof record.toJSON === "function" ? record.toJSON() : record;

        // ambil peminjam list bila perlu
        let peminjamOptions = [];
        if (Peminjam) {
            const all = await Peminjam.findAll({ order: [["username", "ASC"]], limit: 1000 });
            peminjamOptions = all.map(p => (p && typeof p.toJSON === "function" ? p.toJSON() : p));
        }
        const statusOptions = ["aktif", "terlambat", "selesai"];

        return res.render("admin/transaksi/edit_transaksi", {
            transaksi: recordPlain,
            peminjamOptions,
            statusOptions,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("transaksi.showEditForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/** update - update transaksi */
exports.update = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id = req.params.id;
        if (!isValidId(id)) {
            await t.rollback();
            return res.status(400).send("ID tidak valid");
        }

        const item = await Transaksi.findByPk(Number(id));
        if (!item) {
            await t.rollback();
            return res.status(404).send("Transaksi tidak ditemukan");
        }

        const { username, tgl_sewa, tgl_pengembalian, status_transaksi, total_biaya_sewa, total_dp } = req.body;

        if (typeof username !== "undefined" && String(username).trim() === "") {
            await t.rollback();
            return res.redirect("/transaksi/edit/" + id + "?error=" + encodeURIComponent("Username tidak boleh kosong"));
        }
        if (typeof tgl_sewa !== "undefined" && String(tgl_sewa).trim() === "") {
            await t.rollback();
            return res.redirect("/transaksi/edit/" + id + "?error=" + encodeURIComponent("Tanggal sewa tidak boleh kosong"));
        }

        const total = typeof total_biaya_sewa !== "undefined" ? (total_biaya_sewa === "" ? null : Number(total_biaya_sewa)) : item.total_biaya_sewa;
        const dp = typeof total_dp !== "undefined" ? (total_dp === "" ? null : Number(total_dp)) : item.total_dp;

        if (total !== null && (!Number.isFinite(total) || total < 0)) {
            await t.rollback();
            return res.redirect("/transaksi/edit/" + id + "?error=" + encodeURIComponent("total_biaya_sewa harus angka >= 0"));
        }
        if (dp !== null && (!Number.isFinite(dp) || dp < 0)) {
            await t.rollback();
            return res.redirect("/transaksi/edit/" + id + "?error=" + encodeURIComponent("total_dp harus angka >= 0"));
        }
        if (status_transaksi && !["aktif", "terlambat", "selesai"].includes(status_transaksi)) {
            await t.rollback();
            return res.redirect("/transaksi/edit/" + id + "?error=" + encodeURIComponent("Status transaksi tidak valid"));
        }

        if (typeof username !== "undefined") item.username = String(username).trim();
        if (typeof tgl_sewa !== "undefined") item.tgl_sewa = tgl_sewa;
        if (typeof tgl_pengembalian !== "undefined") item.tgl_pengembalian = tgl_pengembalian || null;
        if (typeof status_transaksi !== "undefined") item.status_transaksi = status_transaksi;
        item.total_biaya_sewa = total;
        item.total_dp = dp;

        await item.save({ transaction: t });
        await t.commit();
        return res.redirect("/transaksi/list-transaksi?success=" + encodeURIComponent("Transaksi berhasil diupdate"));
    } catch (err) {
        await t.rollback();
        console.error("transaksi.update error:", err);
        return res.redirect("/transaksi/edit/" + (req.params.id || "") + "?error=" + encodeURIComponent("Gagal mengupdate transaksi"));
    }
};

/** delete - hapus record berdasarkan id_transaksi */
exports.delete = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id = req.params.id;
        if (!isValidId(id)) {
            await t.rollback();
            return res.status(400).send("ID tidak valid");
        }

        const record = await Transaksi.findByPk(Number(id));
        if (!record) {
            await t.rollback();
            return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("Data transaksi tidak ditemukan"));
        }

        await Transaksi.destroy({ where: { id_transaksi: record.id_transaksi }, transaction: t });
        await t.commit();
        return res.redirect("/transaksi/list-transaksi?success=" + encodeURIComponent("Transaksi berhasil dihapus"));
    } catch (err) {
        await t.rollback();
        console.error("transaksi.delete error:", err);
        return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("Gagal menghapus transaksi"));
    }
};

/** showDetail - tampilkan detail transaksi berdasarkan id */
/** showDetail - tampilkan detail transaksi (termasuk barang yang disewa) */
exports.showDetail = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("ID tidak valid"));

        // ambil model fallback dari db
        const Detail = db.detail_transaksi || db.Detail_transaksi || db.detailTransaksi || db.DetailTransaksi || (db.models && (db.models.detail_transaksi || db.models.Detail_transaksi));
        const Barang = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));

        let record = null;

        // pertama coba pakai eager loading dengan alias yang ada: 'detail_transaksis'
        try {
            record = await Transaksi.findByPk(Number(id), {
                include: [
                    {
                        model: Detail,
                        as: 'detail_transaksis', // <-- pakai alias yang sesuai dengan association Anda
                        required: false,
                        include: [
                            // sertakan barang jika asosiasi dari Detail ke Barang ada
                            (Barang ? { model: Barang, as: 'barang', required: false } : null)
                        ].filter(Boolean)
                    }
                ]
            });
        } catch (err) {
            // jika error type eager loading -> fallback ke manual fetch
            console.warn("showDetail: eager include failed, falling back to manual fetch. err:", err && err.message);
        }

        // jika record masih null (atau include gagal), ambil transaksi dulu, lalu fetch detail secara manual
        if (!record) {
            record = await Transaksi.findByPk(Number(id));
            if (!record) return res.status(404).send("Data transaksi tidak ditemukan untuk ID ini");

            // fetch details manual jika model Detail tersedia
            let details = [];
            if (Detail) {
                details = await Detail.findAll({ where: { id_transaksi: Number(id) } });
                // jika Barang tersedia, attach barang ke tiap detail (fallback N+1, tapi aman)
                if (Barang && details.length > 0) {
                    // ubah tiap detail menjadi plain object dan attach barang
                    const detailsPlain = await Promise.all(details.map(async (d) => {
                        const obj = (d && typeof d.toJSON === 'function') ? d.toJSON() : (d || {});
                        try {
                            const br = await Barang.findByPk(Number(obj.id_barang));
                            obj.barang = br && typeof br.toJSON === 'function' ? br.toJSON() : (br || null);
                        } catch (e) {
                            obj.barang = null;
                        }
                        return obj;
                    }));
                    // set details result sebagai plain array
                    record = (typeof record.toJSON === 'function') ? record.toJSON() : record;
                    record.detail_transaksis = detailsPlain;
                } else {
                    // tanpa Barang, hanya plain details
                    const detailsPlain = details.map(d => (d && typeof d.toJSON === 'function') ? d.toJSON() : d);
                    record = (typeof record.toJSON === 'function') ? record.toJSON() : record;
                    record.detail_transaksis = detailsPlain;
                }
            } else {
                // tidak ada Detail model, tetap pakai record plain dengan array kosong
                record = (typeof record.toJSON === 'function') ? record.toJSON() : record;
                record.detail_transaksis = [];
            }

            // render view dan return
            return res.render("admin/transaksi/detail_transaksi", {
                transaksi: record,
                user: req.session?.user || null,
                nama_lengkap: req.session?.user?.nama_lengkap || "",
                error: req.query.error || null,
                success: req.query.success || null,
            });
        }

        // kalau record didapat dari eager include, jadikan plain object
        const recordPlain = typeof record.toJSON === "function" ? record.toJSON() : record;

        return res.render("admin/transaksi/detail_transaksi", {
            transaksi: recordPlain,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("transaksi.showDetail error:", err);
        return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("Terjadi kesalahan saat mengambil data transaksi"));
    }
};
