import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { authenticateToken, AuthenticatedRequest } from "../middlewares/auth.middleware";

const router = Router();

// Setup Multer for Bank Slip Uploads (FR-33)
const uploadDir = path.join(process.cwd(), "uploads", "bank-slips");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `slip-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      return cb(null, true);
    }
    cb(new Error("Only image (jpg, png, webp) or PDF files are allowed for bank slips"));
  },
});

// Helper: generate order number (e.g. TA-2026-0001)
async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.order.count();
  const sequence = String(count + 1).padStart(5, "0");
  return `TA-${year}-${sequence}`;
}

// ----------------------------------------------------
// 1. Create Order (Checkout) (FR-29, FR-33, FR-35)
// ----------------------------------------------------
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { items, deliveryMethod, shippingAddress, paymentMethod, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    if (!deliveryMethod || !shippingAddress || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Delivery method, delivery address, and payment method are required",
      });
    }

    // 1. Enforce Quantity Cap Rule (FR-29): Max 20 units per item
    for (const item of items) {
      if (item.quantity > 20) {
        return res.status(400).json({
          success: false,
          message: `Maximum quantity exceeded for item: "${item.title}". You can purchase a maximum of 20 units of one item per order.`,
        });
      }
      if (item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Invalid quantity for item: "${item.title}". Minimum quantity is 1.`,
        });
      }
    }

    // 2. Enforce Cash on Delivery Toggle (FR-23, FR-35)
    if (paymentMethod === "CASH_ON_DELIVERY") {
      const codSetting = await prisma.storeSetting.findUnique({ where: { key: "cod_enabled" } });
      const isCodEnabled = codSetting ? Boolean((codSetting.value as any)?.enabled) : false;
      if (!isCodEnabled) {
        return res.status(400).json({
          success: false,
          message: "Cash on Delivery is currently disabled by store administration. Please choose Bank Transfer or Online Payment.",
        });
      }
    }

    // 3. Verify Customer Type and Pricing
    const profile = await prisma.customerProfile.findUnique({ where: { userId } });
    const isApprovedWholesale = profile?.customerType === "WHOLESALE" && profile.approvalStatus === "APPROVED";

    // 4. Calculate items, subtotal, and verify products
    let subtotal = 0;
    const orderItemData = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        return res.status(400).json({ success: false, message: `Product not found: ${item.productId}` });
      }

      // Real unit price based on wholesale status
      const unitPrice = isApprovedWholesale && product.wholesalePrice
        ? Number(product.wholesalePrice)
        : Number(product.basePrice);

      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItemData.push({
        productId: product.id,
        title: product.title,
        unitPrice,
        quantity: item.quantity,
        totalPrice,
      });
    }

    // Shipping fee calculation
    let shippingFee = 0;
    if (deliveryMethod === "DOMEX_COURIER") {
      shippingFee = 450; // Standard Domex starting rate
    } else if (deliveryMethod === "PICKME_FLASH") {
      shippingFee = 650; // PickMe Flash estimate
    } else if (deliveryMethod.startsWith("STORE_PICKUP")) {
      shippingFee = 0; // Free pickup at Colombo / Kurunegala
    }

    const totalAmount = subtotal + shippingFee;
    const orderNumber = await generateOrderNumber();

    // 5. Create Order atomically
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId,
        customerTypeAtOrder: profile?.customerType || "REGULAR",
        status: "PENDING",
        subtotal,
        shippingFee,
        totalAmount,
        deliveryMethod,
        shippingAddress,
        notes,
        items: {
          create: orderItemData,
        },
        payments: {
          create: {
            paymentMethod,
            status: paymentMethod === "CASH_ON_DELIVERY" ? "PENDING_VERIFICATION" : "PENDING_VERIFICATION",
          },
        },
      },
      include: {
        items: true,
        payments: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      orderNumber: order.orderNumber,
      orderId: order.id,
      totalAmount: order.totalAmount,
      paymentMethod,
    });
  } catch (error: any) {
    console.error("create-order error:", error);
    res.status(500).json({ success: false, message: "Failed to place order" });
  }
});

// ----------------------------------------------------
// 2. Upload Bank Transfer Slip (FR-33)
// ----------------------------------------------------
router.post(
  "/:orderId/bank-slip",
  authenticateToken,
  upload.single("slip"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orderId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ success: false, message: "Please select an image or PDF of your bank deposit slip" });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      if (order.userId !== req.user!.userId && req.user!.role !== "SUPER_ADMIN") {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const bankSlipUrl = `/uploads/bank-slips/${file.filename}`;

      // Update payment record with slip URL
      const payment = order.payments.find((p) => p.paymentMethod === "BANK_TRANSFER") || order.payments[0];

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            bankSlipUrl,
            status: "PENDING_VERIFICATION",
          },
        });
      }

      res.json({
        success: true,
        message: "Bank deposit slip uploaded successfully. Our team will verify and process your order.",
        bankSlipUrl,
      });
    } catch (error: any) {
      console.error("bank slip upload error:", error);
      res.status(500).json({ success: false, message: "Failed to upload deposit slip" });
    }
  }
);

// ----------------------------------------------------
// 3. Customer Order History
// ----------------------------------------------------
router.get("/my-orders", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.userId },
      include: {
        items: {
          include: {
            product: {
              include: { images: { where: { isPrimary: true } } },
            },
          },
        },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: orders,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch order history" });
  }
});

// ----------------------------------------------------
// 4. Track Order by Order Number
// ----------------------------------------------------
router.get("/track/:orderNumber", async (req: Request, res: Response) => {
  try {
    const { orderNumber } = req.params;
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        orderNumber: true,
        status: true,
        deliveryMethod: true,
        trackingNumber: true,
        createdAt: true,
        updatedAt: true,
        totalAmount: true,
        items: {
          select: {
            title: true,
            quantity: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order number not found" });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to track order" });
  }
});

export default router;
