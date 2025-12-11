// controllers/sewaController.js
const db = require("../config/db");
const Sequelize = require("sequelize");
const { Op } = require("sequelize");

// safe model lookup (robust)
let Transaksi = db.transaksi_sewa || db.Transaksi || (db.models && (db.models.transaksi_sewa || db.models.Transaksi || db.models.transaksiSewa));
let Detail = db.detail_transaksi || db.Detail || (db.models && (db.models.detail_transaksi || db.models.Detail));
let Barang = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));

if (!Transaksi) console.error("Model 'Transaksi' (transaksi_sewa) tidak ditemukan di export db. Keys:", Object.keys(db));
if (!Detail) console.error("Model 'Detail' (detail_transaksi) tidak ditemukan di export db. Keys:", Object.keys(db));
if (!Barang) console.error("Model 'Barang' tidak ditemukan di export db. Keys:", Object.keys(db));

function ensureModelsOrRespond(res) {
    const missing = [];
    if (!Transaksi) missing.push("transaksi_sewa");
    if (!Detail) missing.push("detail_transaksi");
    if (!Barang) missing.push("barang");
    if (missing.length > 0) {
        const msg = `Server misconfiguration: model(s) ${missing.join(", ")} tidak tersedia. Periksa config/db.js`;
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

async function findTransaksiById(id, opts = {}) {
    if (!isValidId(id)) return null;
    if (!Transaksi) throw new Error("Model transaksi_sewa tidak tersedia");
    const include = opts.include || [];
    return await Transaksi.findByPk(Number(id), { include, transaction: opts.transaction || null });
}

async function findDetail(id_transaksi, id_barang, options = {}) {
    if (!Detail) throw new Error("Model detail_transaksi tidak tersedia");
    return await Detail.findOne({
        where: { id_transaksi: Number(id_transaksi), id_barang: Number(id_barang) },
        transaction: options.transaction || null,
        lock: options.lock || undefined,
    });
}

function todayDateOnly() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

/** Helper: memastikan request dari owner transaksi */
function ensureOwnerOrRespond(req, res, trx) {
    const sessUser = req.session?.user;
    if (!sessUser) {
        res.redirect("/login?error=" + encodeURIComponent("Silakan login."));
        return false;
    }
    if (!trx) {
        res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
        return false;
    }
    if (String(trx.username) !== String(sessUser.username)) {
        res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Anda tidak berwenang mengakses transaksi ini"));
        return false;
    }
    return true;
}

/**
 * showIndex - hanya transaksi milik user yang login
 * route: GET /sewa/list-sewa
 */
exports.showIndex = async (req, res) => {
    try {
        if (!ensureModelsOrRespond(res)) return;

        const sessUser = req.session?.user;
        if (!sessUser) return res.redirect("/login?error=" + encodeURIComponent("Silakan login"));

        // optional search q still allowed but restrict to owner's
        const q = (req.query.q || "").toString().trim();
        const where = { username: String(sessUser.username) };

        if (q) {
            if (isValidId(q)) {
                where.id_transaksi = Number(q);
            } else {
                // if user searches by username but we enforce owner, ignore different username
                // keep where.username as sessUser.username
            }
        }

        const list = await Transaksi.findAll({
            where,
            order: [["id_transaksi", "DESC"]],
            limit: 200,
        });

        const listPlain = Array.isArray(list) ? list.map((r) => (r && typeof r.toJSON === "function" ? r.toJSON() : r)) : [];

        return res.render("anggota/sewa/list_sewa", {
            list: listPlain,
            filter_q: q,
            user: sessUser,
            nama_lengkap: sessUser?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("sewa.showIndex error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * showCreateCartForm - tampilkan form + daftar barang + currentCart (jika ada)
 * route: GET /sewa/create
 */
exports.showCreateCartForm = async (req, res) => {
    try {
        if (!ensureModelsOrRespond(res)) return;
        const sessUser = req.session?.user;
        if (!sessUser) return res.redirect("/login?error=" + encodeURIComponent("Silakan login"));

        // ambil semua keranjang milik user (bisa lebih dari 1)
        const carts = await Transaksi.findAll({
            where: { username: sessUser.username },
            order: [['id_transaksi', 'DESC']],
            limit: 50,
        });

        // ambil daftar barang (sama seperti sebelumnya)
        const barangs = await Barang.findAll({
            where: {},
            order: [['id_barang', 'ASC']],
            limit: 1000,
        });

        const cartsPlain = Array.isArray(carts) ? carts.map(c => (c && typeof c.toJSON === "function") ? c.toJSON() : c) : [];
        const barangsPlain = Array.isArray(barangs) ? barangs.map(b => (b && typeof b.toJSON === "function" ? b.toJSON() : b)) : [];

        // pilih currentCart berdasarkan query param ?cart=<id> jika ada, atau fallback ke keranjang pertama (terbaru)
        const qCartId = req.query.cart ? Number(req.query.cart) : null;
        let currentCart = null;
        if (qCartId && Number.isInteger(qCartId)) {
            currentCart = cartsPlain.find(c => Number(c.id_transaksi) === Number(qCartId)) || null;
        }
        if (!currentCart && cartsPlain.length > 0) currentCart = cartsPlain[0];

        return res.render("anggota/sewa/create_sewa", {
            user: sessUser,
            nama_lengkap: sessUser?.nama_lengkap || "",
            error: req.query.error || null,
            success: req.query.success || null,
            barangs: barangsPlain,
            carts: cartsPlain,
            currentCart: currentCart || null,
        });
    } catch (err) {
        console.error("sewa.showCreateCartForm error:", err);
        return res.status(500).send("Server Error");
    }
};

/**
 * createCart - POST /sewa/create
 * username will be taken from session (ignore posted username if any)
 */
exports.createCart = async (req, res) => {
    if (!ensureModelsOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const sessUser = req.session?.user;
        if (!sessUser) {
            await t.rollback();
            return res.redirect("/login?error=" + encodeURIComponent("Silakan login"));
        }

        const username = String(sessUser.username);

        const payload = {
            username,
            tgl_sewa: todayDateOnly(),
            tgl_pengembalian: null,
            // tetap gunakan status_transaksi 'aktif' untuk backward-compatibility,
            // karena fungsi lain mengandalkannya — kamu bisa ubah 'draft' jika mau behavior berbeda.
            status_transaksi: "aktif",
            total_biaya_sewa: 0,
            total_dp: 0,
        };

        const trx = await Transaksi.create(payload, { transaction: t });
        await t.commit();

        return res.redirect("/sewa/detail/" + trx.id_transaksi + "?success=" + encodeURIComponent("Keranjang berhasil dibuat"));
    } catch (err) {
        await t.rollback();
        console.error("sewa.createCart error:", err);
        return res.redirect("/sewa/create?error=" + encodeURIComponent("Gagal membuat keranjang: " + (err.message || "")));
    }
};

exports.addToCart = async (req, res) => {
    if (!ensureModelsOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id_transaksi = req.params.id_transaksi;
        if (!isValidId(id_transaksi)) {
            await t.rollback();
            return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("ID transaksi tidak valid"));
        }

        const trx = await findTransaksiById(id_transaksi);
        if (!trx) {
            await t.rollback();
            return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
        }

        // ownership check
        if (!ensureOwnerOrRespond(req, res, trx)) {
            await t.rollback();
            return;
        }

        if (trx.status_transaksi !== "aktif") {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Transaksi sudah tidak dapat diubah"));
        }

        // helper: proses satu item (menggunakan transaction t & row-lock)
        async function processOneItem(id_barang_val, jumlah_sewa_val) {
            const id_barang = Number(id_barang_val);
            const jumlah_sewa = Number(jumlah_sewa_val || 0);

            if (!isValidId(id_barang) || !(Number.isFinite(jumlah_sewa) && jumlah_sewa > 0)) {
                throw new Error(`Input barang/quantity tidak valid untuk id ${id_barang_val}`);
            }

            const item = await Barang.findByPk(Number(id_barang), { transaction: t, lock: Sequelize.Transaction.LOCK.UPDATE });
            if (!item) throw new Error(`Barang id ${id_barang} tidak ditemukan`);
            if (item.stok_tersedia < jumlah_sewa) {
                throw new Error(`Stok tidak cukup untuk "${item.nama_barang}". Tersedia: ${item.stok_tersedia}`);
            }

            // cek apakah detail sudah ada -> gabungkan / update jumlah
            let detail = await Detail.findOne({
                where: { id_transaksi: Number(id_transaksi), id_barang: Number(id_barang) },
                transaction: t,
                lock: Sequelize.Transaction.LOCK.UPDATE
            });

            if (detail) {
                // gabungkan jumlah
                detail.jumlah_sewa = detail.jumlah_sewa + jumlah_sewa;
                detail.harga_sewa_per_satuan = item.harga_dasar_sewa;
                detail.total_harga_sewa = detail.jumlah_sewa * detail.harga_sewa_per_satuan;
                await detail.save({ transaction: t });
            } else {
                await Detail.create({
                    id_transaksi: Number(id_transaksi),
                    id_barang: Number(id_barang),
                    jumlah_sewa,
                    qty_kembali_bagus: 0,
                    harga_sewa_per_satuan: item.harga_dasar_sewa,
                    total_harga_sewa: jumlah_sewa * item.harga_dasar_sewa,
                }, { transaction: t });
            }
        }

        // ---- MODE BATCH ----
        // items format: items[<id_barang>][selected]=1 & items[<id_barang>][qty]=N
        const items = req.body.items;

        if (items && typeof items === 'object' && !Array.isArray(items)) {
            const keys = Object.keys(items);
            if (keys.length === 0) {
                throw new Error("Tidak ada item yang dipilih");
            }

            // iterate semua key; hanya proses yang dipilih (checkbox selected) atau jika qty passed in legacy style
            for (const k of keys) {
                const data = items[k];
                // data bisa object atau string/number depending on form
                let qty = 0;
                let selected = false;

                if (typeof data === 'object' && data !== null) {
                    // checkbox biasanya mengirim data.selected === "1" atau "on"
                    selected = (data.selected === '1' || data.selected === 'on' || data.selected === 1 || data.selected === true);
                    qty = Number(data.qty || data.jumlah || data.jumlah_sewa || 0);
                } else {
                    // form might submit items[id] = "2"
                    qty = Number(data);
                    selected = qty > 0; // if a numeric string was used, treat as selected
                }

                if (!selected) continue; // honor checkbox — hanya yang dicentang diproses
                if (!Number.isFinite(qty) || qty <= 0) continue; // skip invalid qty

                await processOneItem(k, qty);
            }

            await t.commit();
            return res.redirect("/sewa/detail/" + id_transaksi + "?success=" + encodeURIComponent("Item(s) berhasil ditambahkan ke keranjang"));
        }

        // ---- MODE LEGACY / QUICK ADD ----
        // fallback: single add via id_barang + jumlah_sewa
        const id_barang = req.body.id_barang;
        const jumlah_sewa = Number(req.body.jumlah_sewa || 0);
        if (!isValidId(id_barang) || !(Number.isFinite(jumlah_sewa) && jumlah_sewa > 0)) {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Input barang/quantity tidak valid"));
        }

        await processOneItem(id_barang, jumlah_sewa);
        await t.commit();
        return res.redirect("/sewa/detail/" + id_transaksi + "?success=" + encodeURIComponent("Item berhasil ditambahkan ke keranjang"));

    } catch (err) {
        await t.rollback();
        console.error("sewa.addToCart error (batch-aware improved):", err);
        return res.redirect("/sewa/detail/" + (req.params.id_transaksi || '') + "?error=" + encodeURIComponent("Gagal menambahkan item ke keranjang: " + (err.message || "")));
    }
};

exports.updateCartItem = async (req, res) => {
    if (!ensureModelsOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id_transaksi = req.params.id_transaksi;
        const id_barang = req.params.id_barang;
        if (!isValidId(id_transaksi) || !isValidId(id_barang)) {
            await t.rollback();
            return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Parameter tidak valid"));
        }

        const trx = await findTransaksiById(id_transaksi);
        if (!trx) {
            await t.rollback();
            return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
        }

        if (!ensureOwnerOrRespond(req, res, trx)) {
            await t.rollback();
            return;
        }

        if (trx.status_transaksi !== "aktif") {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Transaksi sudah tidak dapat diubah"));
        }

        const newQty = Number(req.body.jumlah_sewa);
        if (!Number.isFinite(newQty) || newQty < 0) {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Quantity tidak valid"));
        }

        const detail = await findDetail(id_transaksi, id_barang, { transaction: t });
        if (!detail) {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Item tidak ditemukan di keranjang"));
        }

        if (newQty === 0) {
            await detail.destroy({ transaction: t });
            await t.commit();
            return res.redirect("/sewa/detail/" + id_transaksi + "?success=" + encodeURIComponent("Item dihapus dari keranjang"));
        }

        const item = await Barang.findByPk(Number(id_barang));
        if (!item) {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Barang tidak ditemukan"));
        }
        if (item.stok_tersedia < newQty) {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent(`Stok tidak cukup. Tersedia: ${item.stok_tersedia}`));
        }

        detail.jumlah_sewa = newQty;
        detail.harga_sewa_per_satuan = item.harga_dasar_sewa;
        detail.total_harga_sewa = newQty * item.harga_dasar_sewa;
        await detail.save({ transaction: t });

        await t.commit();
        return res.redirect("/sewa/detail/" + id_transaksi + "?success=" + encodeURIComponent("Item diupdate"));
    } catch (err) {
        await t.rollback();
        console.error("sewa.updateCartItem error:", err);
        return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Gagal mengupdate item"));
    }
};

exports.removeFromCart = async (req, res) => {
    if (!ensureModelsOrRespond(res)) return;
    const t = await db.sequelize.transaction();
    try {
        const id_transaksi = req.params.id_transaksi;
        const id_barang = req.params.id_barang;
        if (!isValidId(id_transaksi) || !isValidId(id_barang)) {
            await t.rollback();
            return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Parameter tidak valid"));
        }

        const trx = await findTransaksiById(id_transaksi);
        if (!trx) {
            await t.rollback();
            return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
        }

        if (!ensureOwnerOrRespond(req, res, trx)) {
            await t.rollback();
            return;
        }

        if (trx.status_transaksi !== "aktif") {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Transaksi sudah tidak dapat diubah"));
        }

        const detail = await findDetail(id_transaksi, id_barang, { transaction: t });
        if (!detail) {
            await t.rollback();
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Item tidak ditemukan di keranjang"));
        }

        await detail.destroy({ transaction: t });
        await t.commit();
        return res.redirect("/sewa/detail/" + id_transaksi + "?success=" + encodeURIComponent("Item dihapus"));
    } catch (err) {
        await t.rollback();
        console.error("sewa.removeFromCart error:", err);
        return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Gagal menghapus item"));
    }
};

exports.checkoutTransaction = async (req, res) => {
    if (!ensureModelsOrRespond(res)) return;
    try {
        const id_transaksi = req.params.id_transaksi;
        if (!isValidId(id_transaksi)) return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("ID transaksi tidak valid"));

        // verify owner
        const trxCheck = await findTransaksiById(id_transaksi);
        if (!trxCheck) return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
        if (!ensureOwnerOrRespond(req, res, trxCheck)) return;

        const expected_return_date = req.body.expected_return_date || null;
        const total_dp = Number(req.body.total_dp || 0);

        const result = await db.sequelize.transaction(async (t) => {
            const trx = await Transaksi.findByPk(Number(id_transaksi), { transaction: t, lock: Sequelize.Transaction.LOCK.UPDATE });
            if (!trx) throw new Error("Transaksi tidak ditemukan");
            if (trx.status_transaksi !== "aktif") throw new Error("Hanya transaksi berstatus 'aktif' dapat di-checkout");

            const details = await Detail.findAll({ where: { id_transaksi: Number(id_transaksi) }, transaction: t, lock: Sequelize.Transaction.LOCK.UPDATE });
            if (!details || details.length === 0) throw new Error("Keranjang kosong");

            let grandTotal = 0;
            for (const d of details) {
                const b = await Barang.findByPk(d.id_barang, { transaction: t, lock: Sequelize.Transaction.LOCK.UPDATE });
                if (!b) throw new Error(`Barang id ${d.id_barang} tidak ditemukan`);
                if (b.stok_tersedia < d.jumlah_sewa) {
                    throw new Error(`Stok barang "${b.nama_barang}" tidak mencukupi. Tersedia: ${b.stok_tersedia}`);
                }
                b.stok_tersedia = b.stok_tersedia - d.jumlah_sewa;
                await b.save({ transaction: t });

                d.harga_sewa_per_satuan = b.harga_dasar_sewa;
                d.total_harga_sewa = d.jumlah_sewa * d.harga_sewa_per_satuan;
                await d.save({ transaction: t });

                grandTotal += d.total_harga_sewa;
            }

            trx.total_biaya_sewa = grandTotal;
            trx.total_dp = total_dp || trx.total_dp || 0;
            if (expected_return_date) trx.tgl_pengembalian = expected_return_date;
            await trx.save({ transaction: t });

            return { trx, details, grandTotal };
        });

        return res.redirect("/sewa/detail/" + id_transaksi + "?success=" + encodeURIComponent("Checkout berhasil. Total: " + result.grandTotal));
    } catch (err) {
        console.error("sewa.checkoutTransaction error:", err);
        return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Gagal checkout: " + (err.message || "Internal error")));
    }
};

exports.returnTransaction = async (req, res) => {
    if (!ensureModelsOrRespond(res)) return;
    try {
        const id_transaksi = req.params.id_transaksi;
        if (!isValidId(id_transaksi)) return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("ID transaksi tidak valid"));

        const trxCheck = await findTransaksiById(id_transaksi);
        if (!trxCheck) return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Transaksi tidak ditemukan"));
        if (!ensureOwnerOrRespond(req, res, trxCheck)) return;

        let returnsPayload = req.body.returns;
        if (typeof returnsPayload === "string") {
            try { returnsPayload = JSON.parse(returnsPayload); } catch (e) { returnsPayload = null; }
        }
        if (!Array.isArray(returnsPayload) || returnsPayload.length === 0) {
            return res.redirect("/sewa/detail/" + id_transaksi + "?error=" + encodeURIComponent("Data pengembalian tidak valid"));
        }

        const result = await db.sequelize.transaction(async (t) => {
            const trx = await Transaksi.findByPk(Number(id_transaksi), { transaction: t, lock: Sequelize.Transaction.LOCK.UPDATE });
            if (!trx) throw new Error("Transaksi tidak ditemukan");

            const details = await Detail.findAll({ where: { id_transaksi: Number(id_transaksi) }, transaction: t, lock: Sequelize.Transaction.LOCK.UPDATE });
            if (!details || details.length === 0) throw new Error("Transaksi tidak memiliki detail");

            const mapDetail = {};
            for (const d of details) mapDetail[d.id_barang] = d;

            for (const ret of returnsPayload) {
                const id_barang = Number(ret.id_barang);
                const qty_kembali_bagus = Number(ret.qty_kembali_bagus || 0);
                if (!isValidId(id_barang) || !Number.isFinite(qty_kembali_bagus) || qty_kembali_bagus < 0) {
                    throw new Error("Data pengembalian mengandung nilai tidak valid");
                }

                const d = mapDetail[id_barang];
                if (!d) throw new Error(`Item id_barang=${id_barang} tidak ada di transaksi`);

                if (qty_kembali_bagus > d.jumlah_sewa) {
                    throw new Error(`Qty kembali (${qty_kembali_bagus}) melebihi jumlah pinjam (${d.jumlah_sewa}) untuk barang ${id_barang}`);
                }

                d.qty_kembali_bagus = (d.qty_kembali_bagus || 0) + qty_kembali_bagus;
                await d.save({ transaction: t });

                const b = await Barang.findByPk(id_barang, { transaction: t, lock: Sequelize.Transaction.LOCK.UPDATE });
                if (!b) throw new Error(`Barang id ${id_barang} tidak ditemukan saat pengembalian`);
                b.stok_tersedia = b.stok_tersedia + qty_kembali_bagus;
                await b.save({ transaction: t });
            }

            let allReturned = true;
            for (const d of details) {
                const returned = d.qty_kembali_bagus || 0;
                if (returned < d.jumlah_sewa) {
                    allReturned = false;
                    break;
                }
            }

            const actualReturnDate = todayDateOnly();
            if (allReturned) {
                if (trx.tgl_pengembalian && trx.tgl_pengembalian < actualReturnDate) {
                    trx.status_transaksi = "terlambat";
                } else {
                    trx.status_transaksi = "selesai";
                }
                trx.tgl_pengembalian = actualReturnDate;
            } else {
                if (trx.tgl_pengembalian && trx.tgl_pengembalian < actualReturnDate) {
                    trx.status_transaksi = "terlambat";
                } else {
                    trx.status_transaksi = "aktif";
                }
            }
            await trx.save({ transaction: t });

            return { trx, details };
        });

        return res.redirect("/sewa/detail/" + id_transaksi + "?success=" + encodeURIComponent("Pengembalian diproses"));
    } catch (err) {
        console.error("sewa.returnTransaction error:", err);
        return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Gagal memproses pengembalian: " + (err.message || "")));
    }
};

// gantikan seluruh exports.showTransactionDetail dengan fungsi ini
exports.showTransactionDetail = async (req, res) => {
    try {
        if (!ensureModelsOrRespond(res)) return;

        const id_transaksi = req.params.id;
        if (!isValidId(id_transaksi)) return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("ID tidak valid"));

        const trx = await Transaksi.findByPk(Number(id_transaksi));
        if (!trx) return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Transaksi tidak ditemukan"));

        // owner check
        const sessUser = req.session?.user;
        if (!sessUser) return res.redirect("/login?error=" + encodeURIComponent("Silakan login"));
        if (String(trx.username) !== String(sessUser.username)) {
            return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Anda tidak berwenang melihat transaksi ini"));
        }

        // --- robust loading of details + barang (works without changing init-models.js) ---
        const assocKeys = Detail && Detail.associations ? Object.keys(Detail.associations) : [];
        let includeAlias = null;
        if (assocKeys.includes('barang')) includeAlias = 'barang';
        else if (assocKeys.includes('id_barang_barang')) includeAlias = 'id_barang_barang';

        let detailsPlain = [];

        if (includeAlias) {
            const details = await Detail.findAll({
                where: { id_transaksi: Number(id_transaksi) },
                include: [{ model: Barang, as: includeAlias }],
                order: [["id_detail", "ASC"]],
            });

            detailsPlain = details.map(d => {
                const plain = (d && typeof d.toJSON === "function") ? d.toJSON() : d;
                if (includeAlias !== 'barang') {
                    plain.barang = plain[includeAlias] || null;
                }
                return plain;
            });
        } else {
            const details = await Detail.findAll({
                where: { id_transaksi: Number(id_transaksi) },
                order: [["id_detail", "ASC"]],
            });

            const barangIds = [...new Set(details.map(d => (d && d.id_barang) ? Number(d.id_barang) : null).filter(Boolean))];
            let barangMap = {};
            if (barangIds.length > 0) {
                const listBarang = await Barang.findAll({ where: { id_barang: barangIds } });
                barangMap = listBarang.reduce((acc, b) => {
                    const p = (b && typeof b.toJSON === "function") ? b.toJSON() : b;
                    acc[p.id_barang] = p;
                    return acc;
                }, {});
            }

            detailsPlain = details.map(d => {
                const plain = (d && typeof d.toJSON === "function") ? d.toJSON() : d;
                plain.barang = barangMap[plain.id_barang] || null;
                return plain;
            });
        }

        // --- load daftar barang untuk form "Tambah barang" ---
        const allBarangs = await Barang.findAll({
            where: {},
            order: [['id_barang', 'ASC']],
        });
        const barangsPlain = Array.isArray(allBarangs)
            ? allBarangs.map(b => (b && typeof b.toJSON === 'function') ? b.toJSON() : b)
            : [];

        return res.render("anggota/sewa/detail_sewa", {
            transaksi: trx && typeof trx.toJSON === "function" ? trx.toJSON() : trx,
            details: Array.isArray(detailsPlain) ? detailsPlain : [],
            user: sessUser,
            nama_lengkap: sessUser?.nama_lengkap || "",
            // kirim barangs ke view supaya template bisa menggunakannya
            barangs: barangsPlain,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error("sewa.showTransactionDetail error:", err);
        return res.redirect("/sewa/list-sewa?error=" + encodeURIComponent("Terjadi kesalahan saat mengambil data transaksi"));
    }
};

exports.listUserTransactions = async (req, res) => {
    try {
        if (!ensureModelsOrRespond(res)) return;
        const username = (req.params.username || "").toString().trim();
        if (!username) return res.status(400).json({ error: "Username wajib diisi" });

        const list = await Transaksi.findAll({ where: { username }, order: [["id_transaksi", "DESC"]] });
        return res.json(list);
    } catch (err) {
        console.error("sewa.listUserTransactions error:", err);
        return res.status(500).json({ error: "Server error" });
    }
};
