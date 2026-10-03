import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import path from "path";

// Load environment variables
dotenv.config();

// Route imports
import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.routes";
import categoryRoutes from "./routes/category.routes";
import brandRoutes from "./routes/brand.routes";
import orderRoutes from "./routes/order.routes";
import locationRoutes from "./routes/location.routes";
import settingRoutes from "./routes/setting.routes";
import adminRoutes from "./routes/admin.routes";
import uploadRoutes from "./routes/upload.routes";
import bannerRoutes from "./routes/banner.routes";
import { errorHandler } from "./middlewares/error.middleware";
import { startPosSyncCron } from "./lib/posSync";

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for Storefront (port 3000) and Admin (port 4000 / 3001)
const allowedOrigins = [
  process.env.CLIENT_STOREFRONT_URL || "http://localhost:3000",
  process.env.CLIENT_ADMIN_URL || "http://localhost:4000",
  "http://localhost:4000",
  "http://localhost:3001",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow dev tools / mobile in development
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Serve static uploaded files (bank slips, BRC documents, product & category images)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/banners", bannerRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "TransAsia E-Commerce API",
    timestamp: new Date().toISOString(),
  });
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` TransAsia Backend Service running on port ${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  console.log(` Connected to PostgreSQL container on localhost:5432`);
  console.log(`======================================================\n`);

  // Start background POS sync cron job
  startPosSyncCron();
});

export default app;
