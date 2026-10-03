import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { authenticateToken, requireAdmin, AuthenticatedRequest } from "../middlewares/auth.middleware";
import { runPosWholesaleSync, pushPendingWholesaleRegistrations, pullApprovedWholesaleFromPOS } from "../lib/posSync";

const router = Router();

// ----------------------------------------------------
// 1. Admin Login (Email/Username + Password)
// ----------------------------------------------------
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username/email and password required" });
    }

    const adminUser = await prisma.adminUser.findFirst({
      where: {
        OR: [
          { username },
          { user: { email: username } },
          { user: { phone: username } },
        ],
      },
      include: { user: true },
    });

    if (!adminUser || !adminUser.user.passwordHash) {
      return res.status(401).json({ success: false, message: "Invalid administrative credentials" });
    }

    const isMatch = await bcrypt.compare(password, adminUser.user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid administrative credentials" });
    }

    const token = signToken({
      userId: adminUser.user.id,
      email: adminUser.user.email,
      role: adminUser.role,
    });

    res.json({
      success: true,
      token,
      admin: {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        permissions: adminUser.permissions,
      },
    });
  } catch (error: any) {
    console.error("admin login error:", error);
    res.status(500).json({ success: false, message: "Admin login failed" });
  }
});

// All routes below require admin authentication
router.use(authenticateToken);
router.use(requireAdmin(["SUPER_ADMIN", "ORDER_MANAGER", "STAFF"]));

// ----------------------------------------------------
// 2. Orders Management
// ----------------------------------------------------
router.get("/orders", async (req: Request, res: Response) => {
  try {
    const { status, search, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { orderNumber: { contains: String(search), mode: "insensitive" } },
        { user: { phone: { contains: String(search) } } },
      ];
    }

    const take = parseInt(String(limit), 10);
    const skip = (parseInt(String(page), 10) - 1) * take;

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: {
            include: { customerProfile: true },
          },
          items: true,
          payments: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(String(page), 10),
        limit: take,
        totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
});

router.patch("/orders/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status },
    });

    res.json({ success: true, message: "Order status updated successfully", data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to update order status" });
  }
});

router.patch("/orders/:id/tracking", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { trackingNumber } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data: {
        trackingNumber,
        status: "DISPATCHED",
      },
    });

    res.json({ success: true, message: "Tracking number assigned", data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to assign tracking number" });
  }
});

// ----------------------------------------------------
// 3. Customer & Wholesale Management (FR-06, FR-09, FR-10, FR-22)
// ----------------------------------------------------

// List all customers (Retail & Wholesale) with filtering, search, and pagination
router.get("/customers", async (req: Request, res: Response) => {
  try {
    const { type = "ALL", status = "ALL", search, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (type !== "ALL") {
      where.customerType = type;
    }
    if (status !== "ALL") {
      where.approvalStatus = status;
    }
    if (search) {
      const q = String(search).trim();
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { businessName: { contains: q, mode: "insensitive" } },
        { wholesaleCustomerId: { contains: q, mode: "insensitive" } },
        { user: { phone: { contains: q } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const take = parseInt(String(limit), 10);
    const skip = (parseInt(String(page), 10) - 1) * take;

    const [profiles, totalCount] = await Promise.all([
      prisma.customerProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              email: true,
              status: true,
              otpRetryCount: true,
              lockedUntil: true,
              createdAt: true,
              orders: {
                select: { id: true, totalAmount: true, status: true },
              },
            },
          },
          addresses: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.customerProfile.count({ where }),
    ]);

    const formatted = profiles.map((p) => {
      const orders = p.user?.orders || [];
      const totalSpent = orders
        .filter((o: any) => o.status !== "CANCELLED")
        .reduce((sum: number, o: any) => sum + Number(o.totalAmount || 0), 0);
      const isLocked = Boolean(
        p.user?.lockedUntil && new Date(p.user.lockedUntil) > new Date()
      );

      return {
        id: p.id,
        userId: p.userId,
        fullName: p.fullName,
        phone: p.user?.phone || "",
        email: p.user?.email || null,
        customerType: p.customerType,
        wholesaleCustomerId: p.wholesaleCustomerId,
        businessName: p.businessName,
        businessAddress: p.businessAddress,
        ownerName: p.ownerName,
        brcDocumentUrl: p.brcDocumentUrl,
        approvalStatus: p.approvalStatus,
        userStatus: p.user?.status || "ACTIVE",
        isLocked,
        lockedUntil: p.user?.lockedUntil,
        otpRetryCount: p.user?.otpRetryCount || 0,
        createdAt: p.createdAt,
        ordersCount: orders.length,
        totalSpent,
      };
    });

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page: parseInt(String(page), 10),
        limit: take,
        totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  } catch (error: any) {
    console.error("fetch customers error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch customers" });
  }
});

// Customer Summary Statistics
router.get("/customers/stats", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const [total, regular, wholesaleApproved, wholesalePending, locked] = await Promise.all([
      prisma.customerProfile.count(),
      prisma.customerProfile.count({ where: { customerType: "REGULAR" } }),
      prisma.customerProfile.count({
        where: { customerType: "WHOLESALE", approvalStatus: "APPROVED" },
      }),
      prisma.customerProfile.count({
        where: { customerType: "WHOLESALE", approvalStatus: "PENDING" },
      }),
      prisma.user.count({
        where: {
          OR: [
            { lockedUntil: { gt: now } },
            { otpRetryCount: { gte: 5 } },
          ],
        },
      }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        regular,
        wholesaleApproved,
        wholesalePending,
        locked,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch customer stats" });
  }
});

// Create Customer (Retail or Wholesale from Admin)
router.post("/customers", async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      phone,
      email,
      customerType = "REGULAR",
      businessName,
      businessAddress,
      ownerName,
      wholesaleCustomerId,
    } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, message: "Full name and phone number are required" });
    }

    const cleanPhone = String(phone).trim();
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          ...(email ? [{ email: String(email).trim() }] : []),
        ],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `A user with phone ${cleanPhone} or email already exists.`,
      });
    }

    const isWholesale = customerType === "WHOLESALE";
    let assignedWsId = wholesaleCustomerId ? String(wholesaleCustomerId).trim() : null;
    if (isWholesale && !assignedWsId) {
      assignedWsId = `WS-${Math.floor(10000 + Math.random() * 90000)}`;
    }

    const newUser = await prisma.user.create({
      data: {
        phone: cleanPhone,
        email: email ? String(email).trim() : null,
        customerProfile: {
          create: {
            fullName,
            customerType: isWholesale ? "WHOLESALE" : "REGULAR",
            approvalStatus: isWholesale ? "APPROVED" : "APPROVED",
            wholesaleCustomerId: assignedWsId,
            businessName: businessName || null,
            businessAddress: businessAddress || null,
            ownerName: ownerName || fullName,
          },
        },
      },
      include: { customerProfile: true },
    });

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: newUser.customerProfile,
    });
  } catch (error: any) {
    console.error("create customer error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create customer" });
  }
});

// Legacy wholesale applications route for compatibility
router.get("/wholesale-applications", async (req: Request, res: Response) => {
  try {
    const { status = "PENDING" } = req.query;

    const profiles = await prisma.customerProfile.findMany({
      where: {
        customerType: "WHOLESALE",
        approvalStatus: status as any,
      },
      include: {
        user: { select: { id: true, phone: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: profiles });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch wholesale applications" });
  }
});

router.patch("/wholesale-applications/:id/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { wholesaleCustomerId } = req.body;

    const profile = await prisma.customerProfile.update({
      where: { id },
      data: {
        approvalStatus: "APPROVED",
        wholesaleCustomerId: wholesaleCustomerId || `WS-${Math.floor(10000 + Math.random() * 90000)}`,
      },
    });

    res.json({
      success: true,
      message: "Wholesale customer approved successfully. Pricing will update upon their next login.",
      data: profile,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to approve wholesale customer" });
  }
});

router.patch("/wholesale-applications/:id/reject", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = await prisma.customerProfile.update({
      where: { id },
      data: { approvalStatus: "REJECTED" },
    });

    res.json({ success: true, message: "Wholesale customer application rejected", data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to reject application" });
  }
});

// Reset Customer OTP Lockout (supports user id or customer profile id)
router.post("/customers/:id/reset-lockout", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const profile = await prisma.customerProfile.findFirst({
      where: { OR: [{ id }, { userId: id }] },
    });

    const targetUserId = profile ? profile.userId : id;

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        otpRetryCount: 0,
        lockedUntil: null,
      },
    });

    res.json({
      success: true,
      message: `OTP lockout successfully cleared for customer (${user.phone}). Account unlocked.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to clear OTP lockout" });
  }
});

// ----------------------------------------------------
// 5. Toggle Cash on Delivery (FR-23, FR-35)
// ----------------------------------------------------
router.post("/settings/toggle-cod", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;

    const setting = await prisma.storeSetting.upsert({
      where: { key: "cod_enabled" },
      update: { value: { enabled: Boolean(enabled) } },
      create: {
        key: "cod_enabled",
        value: { enabled: Boolean(enabled) },
        description: "Controls whether Cash on Delivery is allowed at checkout",
      },
    });

    res.json({
      success: true,
      message: `Cash on Delivery has been ${Boolean(enabled) ? "enabled" : "disabled"}.`,
      data: setting.value,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to toggle Cash on Delivery" });
  }
});

// ----------------------------------------------------
// 6. View-Only Product Catalog (FR-21)
// ----------------------------------------------------
router.get("/products", async (req: Request, res: Response) => {
  try {
    const { search, page = "1", limit = "25" } = req.query;

    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: "insensitive" } },
        { sku: { contains: String(search), mode: "insensitive" } },
        { posItemCode: { contains: String(search), mode: "insensitive" } },
      ];
    }

    const take = parseInt(String(limit), 10);
    const skip = (parseInt(String(page), 10) - 1) * take;

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          images: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      data: products.map((p) => ({
        ...p,
        isViewOnly: p.isPosSynced, // Explicit indicator for Admin UI (FR-21)
      })),
      pagination: {
        page: parseInt(String(page), 10),
        limit: take,
        totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch admin product catalog" });
  }
});

// ----------------------------------------------------
// 7. Dashboard Metrics & Analytics
// ----------------------------------------------------
router.get("/dashboard/metrics", async (req: Request, res: Response) => {
  try {
    const [totalOrders, pendingOrders, totalProducts, pendingWholesale, revenueAgg] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.product.count(),
      prisma.customerProfile.count({ where: { customerType: "WHOLESALE", approvalStatus: "PENDING" } }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { not: "CANCELLED" } },
      }),
    ]);

    res.json({
      success: true,
      metrics: {
        totalOrders,
        pendingOrders,
        totalProducts,
        pendingWholesaleApplications: pendingWholesale,
        totalRevenue: revenueAgg._sum.totalAmount || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch dashboard metrics" });
  }
});

// ----------------------------------------------------
// 8. POS Wholesale Sync Management
// ----------------------------------------------------
router.post("/pos-sync/trigger", async (req: Request, res: Response) => {
  try {
    const pushResult = await pushPendingWholesaleRegistrations();
    const pullResult = await pullApprovedWholesaleFromPOS();

    res.json({
      success: true,
      message: "POS Wholesale Sync executed successfully",
      summary: {
        pushedToPos: pushResult.pushedCount,
        pushErrors: pushResult.errors,
        approvedFromPos: pullResult.approvedCount,
        rejectedFromPos: pullResult.rejectedCount,
        pullErrors: pullResult.errors,
      },
    });
  } catch (error: any) {
    console.error("pos-sync trigger error:", error);
    res.status(500).json({ success: false, message: error.message || "POS Sync failed" });
  }
});

router.get("/pos-sync/logs", async (req: Request, res: Response) => {
  try {
    const { limit = "20" } = req.query;
    const take = parseInt(String(limit), 10);

    const logs = await prisma.posSyncLog.findMany({
      take,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch POS sync logs" });
  }
});

export default router;
