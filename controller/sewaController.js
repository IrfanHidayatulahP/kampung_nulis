// controllers/sewaController.js
const db = require("../config/db");
const Sequelize = require("sequelize");
const { Op } = require("sequelize");

// --- Model Discovery ---
let Transaksi = db.transaksi_sewa || db.Transaksi || (db.models && (db.models.transaksi_sewa || db.models.Transaksi || db.models.transaksiSewa));
let Detail = db.detail_transaksi || db.Detail || (db.models && (db.models.detail_transaksi || db.models.Detail));
let Barang = db.barang || db.Barang || (db.models && (db.models.barang || db.models.Barang));

// --- Helpers ---
function isValidId(id) {
    if (id == null) return false;
    const n = Number(id);
    return Number.isInteger(n) && n > 0;
}

function todayDateOnly() {
    return new Date().toISOString().slice(0, 10);
}

async function getOrCreateActiveCart(username, transaction = null) {
    // gunakan status 'draft' sebagai keranjang sementara
    let trx = await Transaksi.findOne({
        where: { username, status_transaksi: "draft" },
        order: [['id_transaksi', 'DESC']],
        transaction
    });

    if (!trx) {
        trx = await Transaksi.create({
            username,
            tgl_sewa: todayDateOnly(),
            status_transaksi: "draft",
            total_biaya_sewa: 0,
            total_dp: 0
        }, { transaction });
    }
    return trx;
}

// --- CONTROLLERS ---
exports.showIndex = async (req, res) => {
    try {
        const sessUser = req.session?.user;
        if (!sessUser) return res.redirect("/login");

        const list = await Transaksi.findAll({
            where: {
                username: sessUser.username,
                status_transaksi: { [Op.ne]: 'draft' }
            },
            order: [["id_transaksi", "DESC"]],
        });

        return res.render("anggota/sewa/list_sewa", {
            list: list.map(r => r.toJSON()),
            user: sessUser,
            success: req.query.success,
            error: req.query.error
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.addToCart = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const sessUser = req.session?.user;
        const { id_barang, jumlah_sewa } = req.body;

        if (!sessUser) throw new Error("Silakan login terlebih dahulu");
        if (!isValidId(id_barang)) throw new Error("ID Barang tidak valid");

        const qty = Number(jumlah_sewa || 1);
        if (qty <= 0) throw new Error("Jumlah harus >= 1");

        // A. Dapatkan atau buat keranjang draft
        const trx = await getOrCreateActiveCart(sessUser.username, t);

        // B. Ambil barang & lock
        const barang = await Barang.findByPk(id_barang, {
            transaction: t,
            lock: Sequelize.Transaction.LOCK.UPDATE
        });

        if (!barang) throw new Error("Barang tidak ditemukan");
        if (barang.stok_tersedia < qty) throw new Error(`Stok "${barang.nama_barang}" tidak cukup.`);

        // Hitung harga sesuai role user (server-side)
        const basePrice = Number(barang.harga_dasar_sewa || 0);
        const userStatus = (sessUser.status || "").toString().toLowerCase().replace(/\s+/g, '');
        const isNonAnggota = userStatus.includes('non') || userStatus.includes('nonanggota') || userStatus.includes('non-anggota');
        const hargaDipakai = isNonAnggota ? basePrice * 2 : basePrice;

        // C. Update atau Buat Detail
        let detail = await Detail.findOne({
            where: { id_transaksi: trx.id_transaksi, id_barang },
            transaction: t
        });

        if (detail) {
            // jika sudah ada, tambahkan qty; pertahankan harga_sewa_per_satuan yang tersimpan (agar historis tidak berubah)
            const existingUnitPrice = Number(detail.harga_sewa_per_satuan || 0) || hargaDipakai;
            detail.jumlah_sewa = Number(detail.jumlah_sewa || 0) + qty;
            detail.total_harga_sewa = detail.jumlah_sewa * existingUnitPrice;
            // hanya set harga_sewa_per_satuan jika belum ada
            if (!detail.harga_sewa_per_satuan) detail.harga_sewa_per_satuan = existingUnitPrice;
            await detail.save({ transaction: t });
        } else {
            // buat baru dengan harga sesuai role
            await Detail.create({
                id_transaksi: trx.id_transaksi,
                id_barang,
                jumlah_sewa: qty,
                harga_sewa_per_satuan: hargaDipakai,
                total_harga_sewa: qty * hargaDipakai,
                qty_kembali_bagus: 0
            }, { transaction: t });
        }

        await t.commit();
        return res.redirect("/sewa/cart?success=Barang berhasil ditambahkan");
    } catch (err) {
        await t.rollback();
        console.error(err);
        return res.redirect("back?error=" + encodeURIComponent(err.message));
    }
};

exports.showCart = async (req, res) => {
    try {
        const sessUser = req.session?.user;
        if (!sessUser) return res.redirect("/login");

        const transaksi = await Transaksi.findOne({
            where: {
                username: sessUser.username,
                status_transaksi: 'draft'
            },
            order: [['id_transaksi', 'DESC']]
        });

        if (!transaksi) {
            return res.render("anggota/sewa/keranjang", {
                transaksi: null,
                cartItems: [],
                totalBiaya: 0,
                user: sessUser,
                success: req.query.success || null,
                error: req.query.error || null
            });
        }

        const details = await Detail.findAll({
            where: { id_transaksi: transaksi.id_transaksi },
            order: [['id_detail', 'ASC']]
        });

        const barangIds = details.map(d => d.id_barang).filter(Boolean);
        const barangs = barangIds.length > 0 ? await Barang.findAll({ where: { id_barang: barangIds } }) : [];
        const barangMap = {};
        barangs.forEach(b => { barangMap[b.id_barang] = b.toJSON(); });

        let totalBiaya = 0;
        const cartItems = details.map(d => {
            const barang = barangMap[d.id_barang] || null;
            const subtotal = Number(d.jumlah_sewa || 0) * Number(d.harga_sewa_per_satuan || 0);
            totalBiaya += subtotal;
            return {
                id_keranjang: d.id_detail,
                id_detail: d.id_detail,
                id_transaksi: d.id_transaksi,
                id_barang: d.id_barang,
                jumlah: d.jumlah_sewa,
                harga_sewa_per_satuan: d.harga_sewa_per_satuan,
                total_harga_sewa: subtotal,
                nama_barang: barang?.nama_barang || "Barang Tidak Diketahui",
                photo_path: barang?.photo_path || null,
                stok_tersedia: barang?.stok_tersedia || 0
            };
        });

        return res.render("anggota/sewa/keranjang", {
            transaksi: transaksi.toJSON(),
            cartItems,
            totalBiaya,
            user: sessUser,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error("showCart error:", err);
        res.status(500).send("Gagal memuat keranjang");
    }
};

exports.updateCartItem = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const { id_transaksi, id_barang, new_qty } = req.body;
        const qty = Number(new_qty);

        const detail = await Detail.findOne({
            where: { id_transaksi, id_barang },
            transaction: t
        });

        if (!detail) throw new Error("Item tidak ditemukan");

        if (qty <= 0) {
            await detail.destroy({ transaction: t });
        } else {
            const barang = await Barang.findByPk(id_barang, { transaction: t });
            if (barang.stok_tersedia < qty) throw new Error("Stok tidak mencukupi");

            detail.jumlah_sewa = qty;
            detail.total_harga_sewa = qty * detail.harga_sewa_per_satuan;
            await detail.save({ transaction: t });
        }

        await t.commit();
        res.redirect("/sewa/cart?success=Berhasil diupdate");
    } catch (err) {
        await t.rollback();
        res.redirect("/sewa/cart?error=" + encodeURIComponent(err.message));
    }
};

exports.checkoutTransaction = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const sessUser = req.session?.user;
        if (!sessUser) throw new Error("Silakan login");

        const { id_transaksi, expected_return_date } = req.body;

        if (!expected_return_date) {
            throw new Error("Tanggal pengembalian wajib diisi.");
        }

        const tglSewa = new Date(); // Hari ini
        const tglKembali = new Date(expected_return_date);
        tglSewa.setHours(0, 0, 0, 0);
        tglKembali.setHours(0, 0, 0, 0);
        if (tglKembali < tglSewa) throw new Error("Tanggal kembali tidak boleh kurang dari hari ini.");

        const trx = await Transaksi.findOne({
            where: {
                id_transaksi,
                username: sessUser.username,
                status_transaksi: 'draft'
            },
            transaction: t,
            lock: true
        });

        if (!trx) throw new Error("Keranjang tidak valid");

        const details = await Detail.findAll({
            where: { id_transaksi: trx.id_transaksi },
            transaction: t
        });

        if (details.length === 0) throw new Error("Keranjang kosong");

        // validasi stok & kurangi stok
        let grandTotal = 0;
        for (const d of details) {
            const b = await Barang.findByPk(d.id_barang, { transaction: t, lock: true });
            if (!b) throw new Error("Barang tidak ditemukan saat checkout");
            if (b.stok_tersedia < d.jumlah_sewa) throw new Error(`Stok ${b.nama_barang} tidak mencukupi saat checkout`);

            b.stok_tersedia = Number(b.stok_tersedia) - Number(d.jumlah_sewa);
            await b.save({ transaction: t });

            grandTotal += Number(d.total_harga_sewa || 0);
        }

        trx.total_biaya_sewa = grandTotal;
        trx.status_transaksi = 'aktif';
        trx.tgl_sewa = new Date().toISOString().slice(0, 10);
        trx.tgl_pengembalian = expected_return_date;
        await trx.save({ transaction: t });

        await t.commit();
        res.redirect("/sewa/list-sewa?success=Transaksi berhasil! Barang harap dikembalikan pada " + expected_return_date);
    } catch (err) {
        await t.rollback();
        console.error(err);
        return res.redirect("/sewa/cart?error=" + encodeURIComponent(err.message));
    }
};

exports.showTransactionDetail = async (req, res) => {
    try {
        const sessUser = req.session?.user;
        if (!sessUser) return res.redirect("/login");

        const id_transaksi = Number(req.params.id);
        if (!Number.isInteger(id_transaksi)) return res.redirect("/sewa/list-sewa?error=ID transaksi tidak valid");

        const transaksi = await Transaksi.findByPk(id_transaksi);
        if (!transaksi) return res.redirect("/sewa/list-sewa?error=Transaksi tidak ditemukan");

        if (String(transaksi.username) !== String(sessUser.username)) {
            return res.redirect("/sewa/list-sewa?error=Akses tidak diizinkan");
        }

        // ambil detail (robust terhadap alias relasi)
        let includeAlias = null;
        if (Detail.associations?.barang) includeAlias = 'barang';
        else if (Detail.associations?.id_barang_barang) includeAlias = 'id_barang_barang';

        let details = [];
        if (includeAlias) {
            const raw = await Detail.findAll({
                where: { id_transaksi },
                include: [{ model: Barang, as: includeAlias }],
                order: [['id_detail', 'ASC']]
            });
            details = raw.map(d => {
                const p = d.toJSON();
                if (includeAlias !== 'barang') p.barang = p[includeAlias];
                return p;
            });
        } else {
            const raw = await Detail.findAll({ where: { id_transaksi }, order: [['id_detail', 'ASC']] });
            const barangIds = [...new Set(raw.map(r => r.id_barang).filter(Boolean))];
            const barangs = barangIds.length ? await Barang.findAll({ where: { id_barang: barangIds } }) : [];
            const map = {};
            barangs.forEach(b => map[b.id_barang] = b.toJSON());
            details = raw.map(d => {
                const p = d.toJSON();
                p.barang = map[p.id_barang] || null;
                return p;
            });
        }

        return res.render("anggota/sewa/detail_sewa", {
            transaksi: transaksi.toJSON(),
            details,
            user: sessUser,
            nama_lengkap: sessUser.nama_lengkap || sessUser.username,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error("showTransactionDetail error:", err);
        return res.redirect("/sewa/list-sewa?error=Gagal memuat detail transaksi");
    }
};
