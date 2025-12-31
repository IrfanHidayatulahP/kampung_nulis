const express = require('express');
const router = express.Router();
const barangController = require('../controller/barangController');

// middlewares
const isAdmin = require('../middleware/admin');
const allRole = require('../middleware/allRole');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// pastikan direktori ini ada: public/uploads/barang
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'barang');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // nama file: timestamp-originalname
        const name = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // batas 5MB
    fileFilter: (req, file, cb) => {
        // hanya image
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Hanya file gambar yang diperbolehkan'), false);
        }
        cb(null, true);
    }
});

// Routes
router.get('/list-barang', allRole, barangController.showIndex);
router.get('/detail/:id', allRole, barangController.showDetail);

// Create / Edit / Delete (hanya Admin)
router.get('/create', isAdmin, barangController.showCreateForm);
// gunakan field name "photo" untuk upload
router.post('/create', isAdmin, upload.single('photo'), barangController.create);

router.get('/edit/:id', isAdmin, barangController.showEditForm);
router.post('/edit/:id', isAdmin, upload.single('photo'), barangController.update);

router.post('/delete/:id', isAdmin, barangController.delete);

module.exports = router;
