// controller/rusakHilangController.js
const db = require("../config/db");
const { Op } = require("sequelize");

// Robust model lookup (sesuaikan nama kalau export berbeda)
const RusakHilang = db.rusak_hilang || db.Rusak_hilang || db.RusakHilang || (db.models && (db.models.rusak_hilang || db.models.Rusak_hilang || db.models.RusakHilang));
const DetailModel = db.detail_transaksi || db.Detail_transaksi || (db.models && (db.models.detail_transaksi || db.models.Detail_transaksi));
const BarangModel = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));
const GantiModel = db.ganti_barang || db.Ganti_barang || (db.models && (db.models.ganti_barang || db.models.Ganti_barang));

if (!RusakHilang) {
    console.error("Model 'rusak_hilang' tidak ditemukan pada export db. Keys in db:", Object.keys(db));
}

/** helper: cek ketersediaan model, dan kirim 500 jika tidak ada (untuk route handlers) */
function ensureModelOrRespond(res) {
    if (!RusakHilang) {
        const msg = "Server misconfiguration: model 'rusak_hilang' tidak tersedia. Periksa config/db.js";
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

/**
 * enrichDetailWithBarang(details)
 * - menambahkan nama_barang, harga_dasar_sewa, harga_ganti_barang ke setiap detail
 */
async function enrichDetailWithBarang(details) {
    if (!Array.isArray(details) || details.length === 0) return [];
    if (!BarangModel) {
        // cannot enrich without barang model
        return details.map(d => (typeof d.toJSON === 'function' ? d.toJSON() : d));
    }

    const detailsPlain = details.map(d => (typeof d.toJSON === 'function' ? d.toJSON() : d));
    const idBarangs = Array.from(new Set(detailsPlain.map(d => d.id_barang).filter(Boolean)));
    if (idBarangs.length === 0) return detailsPlain;

    // fetch barang
    const barangs = await BarangModel.findAll({
        where: { id_barang: idBarangs },
        attributes: ['id_barang', 'nama_barang', 'harga_dasar_sewa']
    });
    const barangMap = {};
    barangs.forEach(b => {
        const bp = typeof b.toJSON === 'function' ? b.toJSON() : b;
        barangMap[bp.id_barang] = bp;
    });

    // fetch ganti_barang if exists
    let gantiMap = {};
    if (GantiModel) {
        const gantis = await GantiModel.findAll({
            where: { id_barang: idBarangs },
            attributes: ['id_ganti', 'id_barang', 'harga_ganti_barang']
        });
        gantis.forEach(g => {
            const gp = typeof g.toJSON === 'function' ? g.toJSON() : g;
            gantiMap[gp.id_barang] = gp;
        });
    }

    // attach fields
    return detailsPlain.map(d => {
        const dp = { ...d };
        const b = barangMap[d.id_barang];
        dp.nama_barang = b ? b.nama_barang : null;
        dp.harga_dasar_sewa = b ? b.harga_dasar_sewa : null;
        const g = gantiMap[d.id_barang];
        dp.harga_ganti_barang = g ? g.harga_ganti_barang : null;
        return dp;
    });
}

/**
 * determineBiayaPerItemByDetail(id_detail)
 * - ambil detail -> id_barang -> cek ganti_barang -> fallback ke barang.harga_dasar_sewa
 */
async function determineBiayaPerItemByDetail(id_detail) {
    if (!DetailModel || !BarangModel) return 0;
    try {
        const detail = await DetailModel.findByPk(Number(id_detail));
        if (!detail) return 0;
        const dp = typeof detail.toJSON === 'function' ? detail.toJSON() : detail;
        const id_barang = dp.id_barang;
        if (!id_barang) return 0;

        if (GantiModel) {
            const g = await GantiModel.findOne({ where: { id_barang } });
            if (g) {
                const gp = typeof g.toJSON === 'function' ? g.toJSON() : g;
                if (Number.isFinite(Number(gp.harga_ganti_barang))) return Number(gp.harga_ganti_barang);
            }
        }

        const barang = await BarangModel.findByPk(Number(id_barang));
        if (barang) {
            const bp = typeof barang.toJSON === 'function' ? barang.toJSON() : barang;
            if (Number.isFinite(Number(bp.harga_dasar_sewa))) return Number(bp.harga_dasar_sewa);
        }

        return 0;
    } catch (e) {
        console.error('determineBiayaPerItemByDetail error:', e);
        return 0;
    }
}

/**
 * findRusakHilangById - fallback search by id or id_detail
 */
async function findRusakHilangById(q, useFirst = false) {
    if (!q) return useFirst ? null : [];
    if (!RusakHilang) throw new Error("Model 'rusak_hilang' tidak tersedia");

    if (isValidId(q)) {
        const rec = await RusakHilang.findByPk(Number(q));
        if (rec) return useFirst ? rec : [rec];
    }

    const like = await RusakHilang.findAll({
        where: {
            [Op.or]: [
                { id_rusak_hilang: isNaN(Number(q)) ? 0 : Number(q) },
                { id_detail: isNaN(Number(q)) ? 0 : Number(q) },
            ],
        },
        order: [["id_rusak_hilang", "ASC"]],
    });

    return useFirst ? like[0] || null : like;
}

// Helper: attach nama_barang ke records rusak_hilang berdasarkan id_detail -> detail_transaksi -> id_barang -> barang
async function attachNamaBarangFromDetails(recordsPlain) {
    if (!Array.isArray(recordsPlain) || recordsPlain.length === 0) return recordsPlain;

    if (!DetailModel || !BarangModel) {
        console.error("attachNamaBarangFromDetails: DetailModel atau BarangModel tidak tersedia", {
            hasDetailModel: !!DetailModel,
            hasBarangModel: !!BarangModel
        });
        // fallback: return records unchanged
        return recordsPlain.map(r => ({ ...r, nama_barang: null }));
    }

    // kumpulkan id_detail unik dari hasil rusak_hilang
    const idDetails = Array.from(new Set(recordsPlain.map(r => r.id_detail).filter(Boolean)));
    if (idDetails.length === 0) {
        return recordsPlain.map(r => ({ ...r, nama_barang: null }));
    }

    // ambil semua detail_transaksi yang relevan
    const details = await DetailModel.findAll({
        where: { id_detail: idDetails },
        attributes: ['id_detail', 'id_barang']
    });
    const detailsMap = {};
    details.forEach(d => {
        const dp = (typeof d.toJSON === 'function') ? d.toJSON() : d;
        detailsMap[dp.id_detail] = dp;
    });

    // kumpulkan id_barang unik dari detailsMap
    const idBarangs = Array.from(new Set(Object.values(detailsMap).map(d => d.id_barang).filter(Boolean)));
    let barangMap = {};
    if (idBarangs.length && BarangModel) {
        const barangs = await BarangModel.findAll({
            where: { id_barang: idBarangs },
            attributes: ['id_barang', 'nama_barang']
        });
        barangs.forEach(b => {
            const bp = (typeof b.toJSON === 'function') ? b.toJSON() : b;
            barangMap[bp.id_barang] = bp;
        });
    }

    // attach nama_barang pada setiap record
    return recordsPlain.map(r => {
        const rec = { ...r };
        const d = detailsMap[r.id_detail];
        if (d && d.id_barang && barangMap[d.id_barang]) {
            rec.nama_barang = barangMap[d.id_barang].nama_barang;
        } else {
            rec.nama_barang = null; // atau '-' jika mau langsung diisi
        }
        return rec;
    });
}

/**
 * showIndex - daftar semua record rusak_hilang (opsional ?q=)
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
                const r = await RusakHilang.findByPk(Number(q));
                records = r ? [r] : [];
            } else {
                // Jika mencari berdasarkan nama barang, kita tidak bisa langsung karena tabel rusak_hilang tidak menyimpan nama.
                // Jadi kita cari berdasarkan id_rusak_hilang atau id_detail.
                records = await RusakHilang.findAll({
                    where: {
                        [Op.or]: [
                            { id_rusak_hilang: isNaN(Number(q)) ? 0 : Number(q) },
                            { id_detail: isNaN(Number(q)) ? 0 : Number(q) },
                        ],
                    },
                    order: [["id_rusak_hilang", "ASC"]],
                    limit: 1000,
                });
            }
        } else {
            records = await RusakHilang.findAll({
                order: [["id_rusak_hilang", "ASC"]],
                limit: 1000,
            });
        }

        const recordsPlain = Array.isArray(records)
            ? records.map(r => (r && typeof r.toJSON === 'function' ? r.toJSON() : r))
            : [];

        // Attach nama_barang PER RECORD menggunakan helper yang memakai detail_transaksi -> barang
        const enriched = await attachNamaBarangFromDetails(recordsPlain);

        return res.render("admin/rusak_hilang/list_rusak_hilang", {
            records: enriched,
            rusak_hilang: enriched,
            user,
            nama_lengkap,
            filter_q: q,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("rusakHilang.showIndex error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * showCreateForm - tampilkan form tambah (kirim detailOptions yang sudah di-enrich)
 */
exports.showCreateForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const user = req.session && req.session.user ? req.session.user : null;
        const nama_lengkap = req.session?.user?.nama_lengkap || "";

        let detailOptions = [];
        if (DetailModel) {
            const list = await DetailModel.findAll({
                order: [['id_detail', 'ASC']],
                limit: 1000,
                attributes: ['id_detail', 'id_transaksi', 'id_barang', 'jumlah_sewa', 'harga_sewa_per_satuan']
            });
            detailOptions = await enrichDetailWithBarang(list);
        }

        res.render("admin/rusak_hilang/tambah_rusak_hilang", {
            detailOptions,
            user,
            nama_lengkap,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("rusakHilang.showCreateForm error:", err);
        res.status(500).send("Server Error");
    }
};

/**
 * create - simpan data baru
 */
exports.create = async (req, res) => {
    if (!ensureModelOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const { id_detail, jumlah_rusak, jumlah_hilang, biaya_denda_per_item, nama_barang } = req.body;

        if (!id_detail || !isValidId(id_detail)) {
            await t.rollback();
            return res.redirect("/rusak-hilang/create?error=" + encodeURIComponent("id_detail tidak valid"));
        }

        const jr = Number(jumlah_rusak || 0);
        const jh = Number(jumlah_hilang || 0);
        let biaya = typeof biaya_denda_per_item !== "undefined" && String(biaya_denda_per_item).trim() !== "" ? Number(biaya_denda_per_item) : null;

        if (!Number.isFinite(jr) || jr < 0) {
            await t.rollback();
            return res.redirect("/rusak-hilang/create?error=" + encodeURIComponent("jumlah_rusak harus angka >= 0"));
        }
        if (!Number.isFinite(jh) || jh < 0) {
            await t.rollback();
            return res.redirect("/rusak-hilang/create?error=" + encodeURIComponent("jumlah_hilang harus angka >= 0"));
        }

        // jika biaya tidak diberikan atau <=0, tentukan otomatis
        if (!Number.isFinite(biaya) || biaya <= 0) {
            biaya = await determineBiayaPerItemByDetail(id_detail);
        }

        if (!Number.isFinite(biaya) || biaya < 0) {
            await t.rollback();
            return res.redirect("/rusak-hilang/create?error=" + encodeURIComponent("biaya_denda_per_item tidak valid"));
        }

        const subtotal = (jr + jh) * biaya;

        const payload = {
            id_detail: Number(id_detail),
            jumlah_rusak: jr,
            jumlah_hilang: jh,
            biaya_denda_per_item: biaya,
            subtotal_denda: subtotal
        };

        // optional store nama_barang in payload if model has column nama_barang (model rusak_hilang doesn't),
        // but we won't include nama_barang field unless your table has it.
        // If you want to store nama_barang in table, add column dan uncomment:
        // if (nama_barang) payload.nama_barang = String(nama_barang).trim();

        await RusakHilang.create(payload, { transaction: t });
        await t.commit();

        return res.redirect("/rusak-hilang/list?success=" + encodeURIComponent("Data rusak/hilang berhasil ditambahkan"));
    } catch (err) {
        await t.rollback();
        console.error("rusakHilang.create error:", err);
        return res.redirect("/rusak-hilang/create?error=" + encodeURIComponent("Gagal menyimpan data"));
    }
};

/**
 * showEditForm - tampilkan form edit berdasarkan id_rusak_hilang
 */
exports.showEditForm = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.status(400).send("Parameter id tidak valid");

        const record = await RusakHilang.findByPk(Number(id));
        if (!record) return res.status(404).send("Data rusak/hilang tidak ditemukan");

        const recordPlain = typeof record.toJSON === 'function' ? record.toJSON() : record;

        let detailOptions = [];
        if (DetailModel) {
            const list = await DetailModel.findAll({
                order: [['id_detail', 'ASC']],
                limit: 1000,
                attributes: ['id_detail', 'id_transaksi', 'id_barang', 'jumlah_sewa', 'harga_sewa_per_satuan']
            });
            detailOptions = await enrichDetailWithBarang(list);
        }

        // enrich current record with nama_barang
        const enrichedList = await enrichDetailWithBarang([{ id_detail: recordPlain.id_detail, id_barang: recordPlain.id_barang }]);
        let enrichedRecord = { ...recordPlain, nama_barang: null };

        if (DetailModel && recordPlain.id_detail) {
            const detail = await DetailModel.findByPk(Number(recordPlain.id_detail), {
                attributes: ['id_detail', 'id_barang']
            });

            if (detail) {
                const detailPlain = typeof detail.toJSON === 'function' ? detail.toJSON() : detail;
                if (detailPlain.id_barang && BarangModel) {
                    const barang = await BarangModel.findByPk(Number(detailPlain.id_barang), {
                        attributes: ['id_barang', 'nama_barang', 'harga_dasar_sewa']
                    });
                    if (barang) {
                        const barangPlain = typeof barang.toJSON === 'function' ? barang.toJSON() : barang;
                        enrichedRecord.nama_barang = barangPlain.nama_barang || null;
                        // jika mau juga menambahkan field lainnya:
                        enrichedRecord.id_barang = barangPlain.id_barang;
                        enrichedRecord.harga_dasar_sewa = barangPlain.harga_dasar_sewa;
                    }
                }
            }
        }

        return res.render("admin/rusak_hilang/edit_rusak_hilang", {
            record: enrichedRecord,
            detailOptions,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("rusakHilang.showEditForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * update - update data rusak_hilang
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

        const item = await RusakHilang.findByPk(Number(id));
        if (!item) {
            await t.rollback();
            return res.status(404).send("Data tidak ditemukan");
        }

        const { id_detail, jumlah_rusak, jumlah_hilang, biaya_denda_per_item } = req.body;

        if (id_detail && !isValidId(id_detail)) {
            await t.rollback();
            return res.redirect("/rusak-hilang/edit/" + id + "?error=" + encodeURIComponent("id_detail tidak valid"));
        }

        const jr = typeof jumlah_rusak !== "undefined" ? Number(jumlah_rusak) : (item.jumlah_rusak || 0);
        const jh = typeof jumlah_hilang !== "undefined" ? Number(jumlah_hilang) : (item.jumlah_hilang || 0);
        let biaya = typeof biaya_denda_per_item !== "undefined" && String(biaya_denda_per_item).trim() !== "" ? Number(biaya_denda_per_item) : null;

        if (!Number.isFinite(jr) || jr < 0) {
            await t.rollback();
            return res.redirect("/rusak-hilang/edit/" + id + "?error=" + encodeURIComponent("jumlah_rusak harus angka >= 0"));
        }
        if (!Number.isFinite(jh) || jh < 0) {
            await t.rollback();
            return res.redirect("/rusak-hilang/edit/" + id + "?error=" + encodeURIComponent("jumlah_hilang harus angka >= 0"));
        }

        const useDetailForLookup = id_detail ? id_detail : item.id_detail;
        if (!Number.isFinite(biaya) || biaya <= 0) {
            biaya = await determineBiayaPerItemByDetail(useDetailForLookup);
        }

        if (!Number.isFinite(biaya) || biaya < 0) {
            await t.rollback();
            return res.redirect("/rusak-hilang/edit/" + id + "?error=" + encodeURIComponent("biaya_denda_per_item tidak valid"));
        }

        const subtotal = (jr + jh) * biaya;

        if (typeof id_detail !== "undefined" && id_detail !== "") item.id_detail = Number(id_detail);
        item.jumlah_rusak = jr;
        item.jumlah_hilang = jh;
        item.biaya_denda_per_item = biaya;
        item.subtotal_denda = subtotal;

        await item.save({ transaction: t });
        await t.commit();

        return res.redirect("/rusak-hilang/list?success=" + encodeURIComponent("Data rusak/hilang berhasil diupdate"));
    } catch (err) {
        await t.rollback();
        console.error("rusakHilang.update error:", err);
        return res.redirect("/rusak-hilang/edit/" + (req.params.id || "") + "?error=" + encodeURIComponent("Gagal mengupdate data"));
    }
};

/**
 * delete - hapus record berdasarkan id
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

        const record = await RusakHilang.findByPk(Number(id));
        if (!record) {
            await t.rollback();
            return res.redirect("/rusak-hilang/list?error=" + encodeURIComponent("Data tidak ditemukan"));
        }

        await RusakHilang.destroy({ where: { id_rusak_hilang: record.id_rusak_hilang }, transaction: t });
        await t.commit();

        return res.redirect("/rusak-hilang/list?success=" + encodeURIComponent("Data berhasil dihapus"));
    } catch (err) {
        await t.rollback();
        console.error("rusakHilang.delete error:", err);
        return res.redirect("/rusak-hilang/list?error=" + encodeURIComponent("Gagal menghapus data"));
    }
};

/**
 * showDetail - tampilkan detail berdasarkan id
 */
/**
 * showDetail - tampilkan detail berdasarkan id (perbaikan: ambil detail_transaksi -> barang)
 */
exports.showDetail = async (req, res) => {
    try {
        if (!ensureModelOrRespond(res)) return;

        const id = req.params.id;
        if (!isValidId(id)) return res.redirect("/rusak-hilang/list?error=" + encodeURIComponent("ID tidak valid"));

        // ambil record rusak_hilang
        const record = await RusakHilang.findByPk(Number(id));
        if (!record) return res.status(404).send("Data tidak ditemukan untuk ID ini");

        const recordPlain = typeof record.toJSON === 'function' ? record.toJSON() : record;

        // default enriched object sama dengan recordPlain
        const enriched = { ...recordPlain, nama_barang: null };

        // jika ada model DetailModel, ambil data detail untuk id_detail
        if (DetailModel && recordPlain.id_detail) {
            const detail = await DetailModel.findByPk(Number(recordPlain.id_detail));
            if (detail) {
                const detailPlain = typeof detail.toJSON === 'function' ? detail.toJSON() : detail;

                // jika ada id_barang di detail, ambil barang
                if (detailPlain.id_barang && BarangModel) {
                    const barang = await BarangModel.findByPk(Number(detailPlain.id_barang));
                    if (barang) {
                        const barangPlain = typeof barang.toJSON === 'function' ? barang.toJSON() : barang;
                        enriched.nama_barang = barangPlain.nama_barang || null;

                        // jika Rusak/Hilang tidak menyimpan id_barang, tambahkan untuk konsistensi
                        enriched.id_barang = detailPlain.id_barang;
                    }
                }

                // coba ambil harga pengganti dari GantiModel (prioritas)
                if (GantiModel && detailPlain.id_barang) {
                    const ganti = await GantiModel.findOne({ where: { id_barang: detailPlain.id_barang } });
                    if (ganti) {
                        const gplain = typeof ganti.toJSON === 'function' ? ganti.toJSON() : ganti;
                        // jika record tidak punya biaya atau biayanya sama dengan 0, tunjukkan nilai ganti
                        enriched._derived_biaya_from = 'ganti_barang';
                        enriched._derived_biaya_value = Number(gplain.harga_ganti_barang) || 0;
                    }
                }

                // jika belum ada derived biaya dari ganti, fallback ke harga_dasar_sewa dari barang (jika tersedia)
                if (!enriched._derived_biaya_from && enriched.id_barang && BarangModel) {
                    const barang = await BarangModel.findByPk(Number(enriched.id_barang));
                    if (barang) {
                        const bp = typeof barang.toJSON === 'function' ? barang.toJSON() : barang;
                        enriched._derived_biaya_from = 'harga_dasar_sewa';
                        enriched._derived_biaya_value = Number(bp.harga_dasar_sewa) || 0;
                    }
                }
            }
        }

        // Tentukan biaya final yang akan ditampilkan:
        // - jika recordPlain.biaya_denda_per_item tersimpan (non-null), gunakan itu (karena create/save menyimpannya)
        // - else gunakan derived value (ganti_barang atau harga_dasar_sewa)
        let finalBiaya = null;
        if (Number.isFinite(Number(recordPlain.biaya_denda_per_item)) && Number(recordPlain.biaya_denda_per_item) > 0) {
            finalBiaya = Number(recordPlain.biaya_denda_per_item);
            enriched._biaya_source = 'record';
        } else if (enriched._derived_biaya_value !== undefined) {
            finalBiaya = Number(enriched._derived_biaya_value);
            enriched._biaya_source = enriched._derived_biaya_from || 'derived';
        } else {
            finalBiaya = 0;
            enriched._biaya_source = 'none';
        }

        // pastikan subtotal konsisten (jika ada perbedaan, kita tampilkan subtotal yang tersimpan tapi juga bisa hitung ulang)
        const storedSubtotal = Number(recordPlain.subtotal_denda || 0);
        const computedSubtotal = (Number(recordPlain.jumlah_rusak || 0) + Number(recordPlain.jumlah_hilang || 0)) * finalBiaya;

        // Lampirkan field yang berguna di view:
        enriched.biaya_denda_per_item = finalBiaya;
        enriched.subtotal_denda_computed = computedSubtotal;
        enriched.subtotal_denda = storedSubtotal; // tetap simpan nilai existing dari DB

        // jika Anda ingin menampilkan computed subtotal sebagai sumber kebenaran, Anda bisa:
        // enriched.subtotal_to_show = storedSubtotal || computedSubtotal;
        // tapi kita pilih menampilkan storedSubtotal (konsisten dengan apa yang tersimpan) sambil menyediakan computed untuk debug

        return res.render("admin/rusak_hilang/detail_rusak_hilang", {
            rusak_hilang: enriched,
            user: req.session?.user || null,
            nama_lengkap: req.session?.user?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("rusakHilang.showDetail error:", err);
        return res.redirect("/rusak-hilang/list?error=" + encodeURIComponent("Terjadi kesalahan saat mengambil data"));
    }
};

