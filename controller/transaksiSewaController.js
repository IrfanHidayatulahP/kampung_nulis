const db = require("../config/db");
const { Op } = require("sequelize");

const Sequelize = require('sequelize');

// safe lookup models
let Transaksi = db.transaksi_sewa || db.transaksiSewa || db.Transaksi_sewa || db.TransaksiSewa || (db.models && (db.models.transaksi_sewa || db.models.Transaksi_sewa));
let Detail = db.detail_transaksi || db.detailTransaksi || db.Detail_transaksi || (db.models && (db.models.detail_transaksi || db.models.Detail_transaksi));
let Barang = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));
let Peminjam = db.peminjam || db.Peminjam || (db.models && (db.models.peminjam || db.models.Peminjam));
let RusakHilang = db.rusak_hilang || db.RusakHilang || (db.models && (db.models.rusak_hilang || db.models.RusakHilang));
let GantiBarang = db.ganti_barang || db.gantiBarang || db.Ganti_barang || db.GantiBarang || (db.models && (db.models.ganti_barang || db.models.Ganti_barang || db.models.GantiBarang));

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
        let whereClause = {};

        if (q) {
            if (!isNaN(q) && Number.isInteger(Number(q))) {
                whereClause = {
                    [Op.or]: [
                        { id_transaksi: Number(q) },
                        { username: { [Op.like]: `%${q}%` } },
                        { status_transaksi: { [Op.like]: `%${q}%` } }
                    ]
                };
            } else {
                whereClause = {
                    [Op.or]: [
                        { username: { [Op.like]: `%${q}%` } },
                        { status_transaksi: { [Op.like]: `%${q}%` } }
                    ]
                };
            }
        }

        records = await Transaksi.findAll({
            where: whereClause,
            order: [["id_transaksi", "ASC"]],
            limit: 1000,
        });

        const recordsPlain = Array.isArray(records)
            ? records.map(r => (r && typeof r.toJSON === "function" ? r.toJSON() : r))
            : [];

        return res.render("admin/transaksi/list_transaksi", {
            records: recordsPlain,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            filter_q: q,
            error: req.query.error || (req.flash ? req.flash('error') : null),
            success: req.query.success || (req.flash ? req.flash('success') : null),
        });
    } catch (err) {
        console.error("transaksi.showIndex error:", err);
        return res.status(500).send("Server Error: " + err.message);
    }
};

/** showCreateForm - tampilkan form tambah transaksi */
exports.showCreateForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

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

/** showEditForm - tampilkan form edit berdasarkan id_transaksi (header + detail + data pendukung) */
exports.showEditForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.status(400).send("Parameter id tidak valid");

        let trx = await Transaksi.findByPk(Number(id));
        if (!trx) return res.status(404).send("Data transaksi tidak ditemukan");

        const transaksiPlain = typeof trx.toJSON === "function" ? trx.toJSON() : trx;

        // ambil details beserta data rusak_hilang (jika ada)
        let details = [];
        if (Detail) {
            const includes = [];

            if (RusakHilang && Detail.associations) {
                // coba deteksi asosiasi dari Detail ke RusakHilang
                const assoc = Object.values(Detail.associations).find(a => {
                    try {
                        return a.target && (a.target.name === (RusakHilang.name || (RusakHilang.options && RusakHilang.options.name && RusakHilang.options.name.singular)) || a.target === RusakHilang);
                    } catch (e) {
                        return false;
                    }
                });

                if (assoc && assoc.as) {
                    includes.push({ model: RusakHilang, as: assoc.as, required: false });
                } else {
                    // fallback ke alias yang ada di init-models.js (hasMany alias)
                    includes.push({ model: RusakHilang, as: "rusak_hilangs", required: false });
                }
            }

            const detailsRaw = await Detail.findAll({
                where: { id_transaksi: Number(id) },
                include: includes,
                order: [["id_detail", "ASC"]]
            });

            details = (Array.isArray(detailsRaw) ? detailsRaw.map(d => {
                let obj = (d && typeof d.toJSON === "function") ? d.toJSON() : d;

                // Normalisasi akses data rusak_hilang
                let rh = null;
                const possibleProps = ["rusak_hilangs", "rusak_hilang", "RusakHilang", "id_detail_detail_transaksi"];
                for (const p of possibleProps) {
                    if (Object.prototype.hasOwnProperty.call(obj, p) && typeof obj[p] !== "undefined") {
                        rh = obj[p];
                        break;
                    }
                }
                if (Array.isArray(rh)) rh = rh[0] || null; // ambil record pertama jika array
                obj.rusak_hilang_data = rh || null;

                return obj;
            }) : []);
        }

        // ambil barang & peminjam
        let barangsPlain = [];
        if (Barang) {
            const bList = await Barang.findAll({ order: [['id_barang', 'ASC']], limit: 2000 });
            barangsPlain = Array.isArray(bList) ? bList.map(b => (b && typeof b.toJSON === "function") ? b.toJSON() : b) : [];
        }

        // ambil harga ganti (denda default) dan attach ke barang
        if (GantiBarang && Array.isArray(barangsPlain) && barangsPlain.length > 0) {
            const barangIds = barangsPlain.map(b => b.id_barang).filter(Boolean);
            const gList = await GantiBarang.findAll({ where: { id_barang: barangIds } });
            const gMap = {};
            (Array.isArray(gList) ? gList : []).forEach(g => {
                const obj = (g && typeof g.toJSON === "function") ? g.toJSON() : g;
                if (obj && obj.id_barang) gMap[obj.id_barang] = obj.harga_ganti_barang || 0;
            });
            // attach
            barangsPlain.forEach(b => {
                b.harga_ganti_barang = gMap[b.id_barang] || 0;
            });
        } else {
            // pastikan property ada
            barangsPlain.forEach(b => { if (typeof b.harga_ganti_barang === 'undefined') b.harga_ganti_barang = 0; });
        }

        // Jika ada details, per baris set default biaya_denda_per_item dari ganti_barang bila belum ada
        if (Array.isArray(details) && details.length > 0) {
            const gMapByBarang = {};
            barangsPlain.forEach(b => { gMapByBarang[b.id_barang] = b.harga_ganti_barang || 0; });

            details = details.map(d => {
                if (!d.rusak_hilang_data) {
                    d.rusak_hilang_data = {
                        jumlah_rusak: 0,
                        jumlah_hilang: 0,
                        biaya_denda_per_item: gMapByBarang[d.id_barang] || 0,
                        subtotal_denda: 0
                    };
                } else {
                    // jika sudah ada record tapi biaya_denda_per_item kosong/0, isi dari gMap
                    if (!d.rusak_hilang_data.biaya_denda_per_item || Number(d.rusak_hilang_data.biaya_denda_per_item) === 0) {
                        d.rusak_hilang_data.biaya_denda_per_item = gMapByBarang[d.id_barang] || 0;
                    }
                    // jika ada jumlah rusak/hilang dan biaya, hitung subtotal in-memory (untuk tampilan)
                    const jr = Number(d.rusak_hilang_data.jumlah_rusak || 0);
                    const jh = Number(d.rusak_hilang_data.jumlah_hilang || 0);
                    const biaya = Number(d.rusak_hilang_data.biaya_denda_per_item || 0);
                    d.rusak_hilang_data.subtotal_denda = (jr + jh) * biaya;
                }
                return d;
            });
        }

        let peminjamOptions = [];
        if (Peminjam) {
            const all = await Peminjam.findAll({ order: [['username', 'ASC']], limit: 2000 });
            peminjamOptions = Array.isArray(all) ? all.map(p => (p && typeof p.toJSON === "function") ? p.toJSON() : p) : [];
        }

        const statusOptions = ["aktif", "terlambat", "selesai", "draft"];

        return res.render("admin/transaksi/edit_transaksi", {
            transaksi: transaksiPlain,
            details,
            barangs: barangsPlain,
            peminjamOptions,
            statusOptions,
            user: req.session?.user || null,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error("transaksi.showEditForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/** update - update transaksi + update/create/delete detail + rusak_hilang */
exports.update = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id = req.params.id;
        if (!isValidId(id)) { await t.rollback(); return res.status(400).send("ID tidak valid"); }

        const TransaksiModel = Transaksi;
        const DetailModel = Detail;
        const RusakHilangModel = RusakHilang;

        // helper: ambil field baik tanpa atau dengan bracket "[]"
        const getField = (name) => {
            // try direct, then with [] suffix
            if (Object.prototype.hasOwnProperty.call(req.body, name) && typeof req.body[name] !== 'undefined') return req.body[name];
            const nameWithBrackets = name + '[]';
            if (Object.prototype.hasOwnProperty.call(req.body, nameWithBrackets) && typeof req.body[nameWithBrackets] !== 'undefined') return req.body[nameWithBrackets];
            return undefined;
        };

        // normalize to array
        const asArray = (v) => {
            if (v === undefined || v === null) return [];
            if (Array.isArray(v)) return v;
            // sometimes bodyparser returns a single value string
            return [v];
        };

        // Detect whether the form included any detail_* keys at all
        const hasDetailFields = Object.keys(req.body).some(k => k.indexOf('detail_') === 0 || k.indexOf('detail_') > 0);
        // (the above catches keys like "detail_id", "detail_id[]" etc.)

        // Read header fields
        const { username, tgl_sewa, tgl_pengembalian, status_transaksi } = req.body;
        const total_dp_raw = req.body.total_dp;
        const total_dp = (typeof total_dp_raw !== 'undefined') ? Number(total_dp_raw || 0) : undefined;

        // Load transaksi with lock
        const trxRecord = await TransaksiModel.findByPk(Number(id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!trxRecord) { await t.rollback(); return res.status(404).send("Transaksi tidak ditemukan"); }

        // Update header
        if (username) trxRecord.username = String(username).trim();
        if (tgl_sewa) trxRecord.tgl_sewa = tgl_sewa;
        trxRecord.tgl_pengembalian = tgl_pengembalian || null;
        if (status_transaksi) trxRecord.status_transaksi = status_transaksi;
        if (typeof total_dp !== 'undefined') trxRecord.total_dp = Number(total_dp) || 0;

        // If there are no detail fields in request, skip detail processing (prevents accidental delete)
        if (!hasDetailFields) {
            await trxRecord.save({ transaction: t });
        } else {
            // read arrays (support both plain name and bracket name)
            const ids = asArray(getField('detail_id'));
            const barangIds = asArray(getField('detail_id_barang'));
            const qtys = asArray(getField('detail_qty'));
            const hargaArr = asArray(getField('detail_harga_per_satuan'));
            const rusakArr = asArray(getField('detail_rusak'));
            const hilangArr = asArray(getField('detail_hilang'));
            const dendaArr = asArray(getField('detail_denda'));

            // Determine rows to process
            const rowCount = Math.max(0, ids.length, barangIds.length, qtys.length, hargaArr.length, rusakArr.length, hilangArr.length, dendaArr.length);

            // Load existing details
            const existingDetails = await DetailModel.findAll({ where: { id_transaksi: Number(id) }, transaction: t });
            const existingMap = {};
            existingDetails.forEach(d => existingMap[d.id_detail] = d);
            const keptIds = new Set();

            for (let i = 0; i < rowCount; i++) {
                const rawId = ids[i] || "";
                const idDetail = rawId ? Number(rawId) : null;

                const rawBarang = typeof barangIds[i] !== 'undefined' ? barangIds[i] : null;
                let idBarang = rawBarang ? Number(rawBarang) : null;
                const newQty = Number(qtys[i] || 0);
                const newHarga = Number(hargaArr[i] || 0);

                const qtyRusak = Number(rusakArr[i] || 0);
                const qtyHilang = Number(hilangArr[i] || 0);
                const biayaDenda = Number(dendaArr[i] || 0);

                // fallback to existing's id_barang if needed
                if (idDetail && existingMap[idDetail] && (!idBarang || idBarang === 0)) {
                    idBarang = existingMap[idDetail].id_barang;
                }

                // skip empty rows
                if ((!idDetail && (!idBarang || idBarang === 0)) || (newQty === 0)) {
                    continue;
                }

                // validation
                if ((qtyRusak + qtyHilang) > newQty) {
                    await t.rollback();
                    return res.redirect(`/transaksi/edit/${id}?error=` + encodeURIComponent(`Baris ke-${i + 1}: Jumlah Rusak + Hilang melebihi Jumlah Sewa`));
                }

                let currentDetailId = null;
                let det = null;

                if (idDetail && existingMap[idDetail]) {
                    det = existingMap[idDetail];
                    if (idBarang && idBarang !== 0) det.id_barang = idBarang;
                    det.jumlah_sewa = newQty;
                    det.harga_sewa_per_satuan = newHarga;
                    det.total_harga_sewa = newQty * newHarga;
                    await det.save({ transaction: t });

                    currentDetailId = det.id_detail;
                    keptIds.add(idDetail);
                } else {
                    det = await DetailModel.create({
                        id_transaksi: Number(id),
                        id_barang: idBarang || null,
                        jumlah_sewa: newQty,
                        harga_sewa_per_satuan: newHarga,
                        total_harga_sewa: newHarga * newQty,
                        qty_kembali_bagus: 0
                    }, { transaction: t });

                    currentDetailId = det.id_detail;
                    if (currentDetailId) keptIds.add(currentDetailId);
                }

                // handle rusak_hilang
                if (currentDetailId && RusakHilangModel) {
                    const adaMasalah = (qtyRusak > 0 || qtyHilang > 0 || biayaDenda > 0);
                    const existingRH = await RusakHilangModel.findOne({ where: { id_detail: currentDetailId }, transaction: t });
                    const subtotalDenda = (qtyRusak + qtyHilang) * biayaDenda;

                    if (adaMasalah) {
                        if (existingRH) {
                            existingRH.jumlah_rusak = qtyRusak;
                            existingRH.jumlah_hilang = qtyHilang;
                            existingRH.biaya_denda_per_item = biayaDenda;
                            existingRH.subtotal_denda = subtotalDenda;
                            await existingRH.save({ transaction: t });
                        } else {
                            await RusakHilangModel.create({
                                id_detail: currentDetailId,
                                jumlah_rusak: qtyRusak,
                                jumlah_hilang: qtyHilang,
                                biaya_denda_per_item: biayaDenda,
                                subtotal_denda: subtotalDenda
                            }, { transaction: t });
                        }
                    } else {
                        if (existingRH) {
                            await existingRH.destroy({ transaction: t });
                        }
                    }
                }
            } // end loop rows

            // delete removed details only if detail fields were present (intent to edit)
            for (const d of existingDetails) {
                if (!keptIds.has(d.id_detail)) {
                    if (RusakHilangModel) {
                        await RusakHilangModel.destroy({ where: { id_detail: d.id_detail }, transaction: t });
                    }
                    await DetailModel.destroy({ where: { id_detail: d.id_detail }, transaction: t });
                }
            }
        } // end hasDetailFields branch

        // Recompute totals from DB (always compute from DB to ensure consistency)
        const remaining = await DetailModel.findAll({ where: { id_transaksi: Number(id) }, transaction: t });
        let grand = 0;
        remaining.forEach(d => { grand += Number(d.total_harga_sewa || 0); });

        let totalDenda = 0;
        if (RusakHilangModel) {
            const detailIds = remaining.map(r => r.id_detail).filter(Boolean);
            if (detailIds.length > 0) {
                const rhList = await RusakHilangModel.findAll({ where: { id_detail: detailIds }, transaction: t });
                (rhList || []).forEach(rh => { totalDenda += Number(rh.subtotal_denda || 0); });
            }
        }

        // simpan grand total (sewa + denda) ke kolom total_biaya_sewa
        trxRecord.total_biaya_sewa = grand + totalDenda;
        await trxRecord.save({ transaction: t });

        await t.commit();
        return res.redirect("/transaksi/list-transaksi?success=" + encodeURIComponent("Transaksi dan data kerusakan berhasil diupdate"));
    } catch (err) {
        await t.rollback();
        console.error("transaksi.update error:", err);
        return res.redirect("/transaksi/edit/" + (req.params.id || "") + "?error=" + encodeURIComponent("Gagal update: " + (err && err.message ? err.message : String(err))));
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

exports.showDetail = async (req, res) => {
    try {
        if (!Transaksi) {
            return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("Model transaksi tidak tersedia"));
        }

        const id = req.params.id;
        if (!isValidId(id)) return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("ID tidak valid"));

        const include = [];

        if (Transaksi.associations) {
            if (Transaksi.associations.username_peminjam && Peminjam) {
                include.push({ model: Peminjam, as: "username_peminjam", required: false });
            } else if (Transaksi.associations.peminjam && Peminjam) {
                include.push({ model: Peminjam, as: "peminjam", required: false });
            }
        }

        let detailAlias = null;
        if (Transaksi.associations && (Transaksi.associations.detail_transaksis || Transaksi.associations.detailTransaksis || Transaksi.associations.detail_transaksi)) {
            if (Transaksi.associations.detail_transaksis) detailAlias = "detail_transaksis";
            else if (Transaksi.associations.detailTransaksis) detailAlias = "detailTransaksis";
            else if (Transaksi.associations.detail_transaksi) detailAlias = "detail_transaksi";
        }

        if (detailAlias && Detail) {
            let barangInclude = null;
            if (Detail.associations) {
                if (Detail.associations.id_barang_barang && Barang) barangInclude = { model: Barang, as: "id_barang_barang", required: false };
                else if (Detail.associations.barang && Barang) barangInclude = { model: Barang, as: "barang", required: false };
                else if (Detail.associations.Barang && Barang) barangInclude = { model: Barang, as: "Barang", required: false };
            }
            const detailInclude = { model: Detail, as: detailAlias, required: false };
            if (barangInclude) detailInclude.include = [barangInclude];
            include.push(detailInclude);
        }

        let record = null;
        if (include.length > 0) {
            try {
                const found = await Transaksi.findByPk(Number(id), { include });
                if (found) record = typeof found.toJSON === 'function' ? found.toJSON() : found;
            } catch (e) {
                console.warn("Eager load gagal:", e && e.message);
            }
        }

        if (!record) {
            const trxRaw = await Transaksi.findByPk(Number(id));
            if (!trxRaw) return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("Transaksi tidak ditemukan"));

            record = typeof trxRaw.toJSON === "function" ? trxRaw.toJSON() : trxRaw;

            if (Peminjam && record.username) {
                try {
                    const p = await Peminjam.findByPk(record.username);
                    record.username_peminjam = p ? (typeof p.toJSON === "function" ? p.toJSON() : p) : null;
                } catch (e) {
                    record.username_peminjam = null;
                }
            }

            if (Detail) {
                const detailsRaw = await Detail.findAll({ where: { id_transaksi: Number(id) }, order: [["id_detail", "ASC"]] });
                const detailsPlain = (Array.isArray(detailsRaw) ? detailsRaw.map(d => (typeof d.toJSON === "function" ? d.toJSON() : d)) : []);

                if (Barang && detailsPlain.length > 0) {
                    const barangIds = [...new Set(detailsPlain.map(d => d.id_barang).filter(Boolean))];
                    const barangs = await Barang.findAll({ where: { id_barang: barangIds } });
                    const map = {};
                    barangs.forEach(b => map[b.id_barang] = (typeof b.toJSON === "function" ? b.toJSON() : b));
                    detailsPlain.forEach(d => { d.barang = map[d.id_barang] || null; });
                }

                record.detail_transaksis = detailsPlain;
            } else {
                record.detail_transaksis = [];
            }
        } else {
            if (!record.detail_transaksis) {
                const possibleDetailProps = Object.keys(record).filter(k => Array.isArray(record[k]));
                let found = null;
                for (const p of possibleDetailProps) {
                    if (record[p].length === 0) { found = p; break; }
                    const first = record[p][0];
                    if (first && (first.id_detail || first.id_transaksi || first.id_barang)) { found = p; break; }
                }
                if (found) record.detail_transaksis = record[found];
                else record.detail_transaksis = [];
            }

            record.detail_transaksis = record.detail_transaksis.map(d => {
                if (d.id_barang_barang && !d.barang) d.barang = d.id_barang_barang;
                return d;
            });

            if (!record.username_peminjam) {
                if (record.peminjam) record.username_peminjam = record.peminjam;
                else if (record.user) record.username_peminjam = record.user;
            }
        }

        let grandTotal = 0;
        (Array.isArray(record.detail_transaksis) ? record.detail_transaksis : []).forEach(d => {
            const jumlah = Number(d.jumlah_sewa || d.jumlah || 0);
            const harga = Number(d.harga_sewa_per_satuan || d.harga_sewa || 0);
            const total = Number(d.total_harga_sewa) || (jumlah * harga) || 0;
            grandTotal += total;
            d._jumlah = jumlah;
            d._harga = harga;
            d._total = total;
            if (d.barang && typeof d.barang.toJSON === "function") d.barang = d.barang.toJSON();
        });

        return res.render("admin/transaksi/detail_transaksi", {
            transaksi: record,
            details: record.detail_transaksis || [],
            grandTotal,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error("transaksi.showDetail error:", err);
        return res.redirect("/transaksi/list-transaksi?error=" + encodeURIComponent("Terjadi kesalahan saat mengambil data transaksi"));
    }
};
