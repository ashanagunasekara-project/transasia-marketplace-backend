"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// Ensure upload directory exists
const uploadDir = path_1.default.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// Storage configuration
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `img-${uniqueSuffix}${ext}`);
    },
});
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("Only image files (.jpg, .jpeg, .png, .webp, .gif, .svg) are allowed"));
    }
};
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter,
});
router.post("/", upload.single("image"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file provided" });
        }
        const fileUrl = `/uploads/${req.file.filename}`;
        res.status(201).json({
            success: true,
            url: fileUrl,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || "Failed to upload image" });
    }
});
exports.default = router;
//# sourceMappingURL=upload.routes.js.map