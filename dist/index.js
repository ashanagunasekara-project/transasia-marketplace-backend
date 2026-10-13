"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config();
// Route imports
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const brand_routes_1 = __importDefault(require("./routes/brand.routes"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const location_routes_1 = __importDefault(require("./routes/location.routes"));
const setting_routes_1 = __importDefault(require("./routes/setting.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const banner_routes_1 = __importDefault(require("./routes/banner.routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
const posSync_1 = require("./lib/posSync");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Enable CORS for Storefront (port 3000) and Admin (port 4000 / 3001)
const allowedOrigins = [
    process.env.CLIENT_STOREFRONT_URL || "http://localhost:3000",
    process.env.CLIENT_ADMIN_URL || "http://localhost:4000",
    "http://localhost:4000",
    "http://localhost:3001",
    "http://localhost:3000",
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(null, true); // Allow dev tools / mobile in development
        }
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)("dev"));
// Serve static uploaded files (bank slips, BRC documents, product & category images)
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
// Mount API routes
app.use("/api/auth", auth_routes_1.default);
app.use("/api/products", product_routes_1.default);
app.use("/api/categories", category_routes_1.default);
app.use("/api/brands", brand_routes_1.default);
app.use("/api/orders", order_routes_1.default);
app.use("/api/locations", location_routes_1.default);
app.use("/api/settings", setting_routes_1.default);
app.use("/api/admin", admin_routes_1.default);
app.use("/api/upload", upload_routes_1.default);
app.use("/api/banners", banner_routes_1.default);
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "TransAsia E-Commerce API",
        timestamp: new Date().toISOString(),
    });
});
// Global Error Handler
app.use(error_middleware_1.errorHandler);
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(` TransAsia Backend Service running on port ${PORT}`);
    console.log(` Health check: http://localhost:${PORT}/health`);
    console.log(` Connected to PostgreSQL container on localhost:5432`);
    console.log(`======================================================\n`);
    // Start background POS sync cron job
    (0, posSync_1.startPosSyncCron)();
});
exports.default = app;
//# sourceMappingURL=index.js.map