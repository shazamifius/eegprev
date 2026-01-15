// middleware/upload.js
const multer = require('multer');
const path = require('path');

// Configuration de Multer pour le stockage des images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let dest = './public/images/';
        if (file.fieldname === "avatar") {
            dest += 'avatars';
        } else if (file.fieldname === "showcase") {
            dest += 'showcase';
        } else if (file.fieldname === "main_image" || file.fieldname === "secondary_images") {
            dest += 'projects';
        } else if (file.fieldname === "project_files") {
            dest = './public/files/projects';
        } else if (file.fieldname === "media") {
            dest += 'publications';
        } else if (file.fieldname === "image") {
            dest += 'news';
        }
        cb(null, dest);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 1024 * 5, // 5GB limit (virtually unlimited)
        files: 9999 // High file count limit
    }
});

module.exports = { upload };
