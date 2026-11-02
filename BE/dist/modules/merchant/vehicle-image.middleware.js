import multer from 'multer';
const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter(_req, file, callback) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            callback(new Error('Ảnh xe chỉ hỗ trợ định dạng JPG, PNG hoặc WebP.'));
            return;
        }
        callback(null, true);
    },
}).single('image');
export const uploadVehicleImage = (req, res, next) => {
    imageUpload(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
            ? 'Ảnh xe không được vượt quá 5 MB.'
            : error.message;
        res.status(400).json({ success: false, message });
    });
};
