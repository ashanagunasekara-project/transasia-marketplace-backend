"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../lib/jwt");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const posSync_1 = require("../lib/posSync");
const router = (0, express_1.Router)();
// ----------------------------------------------------
// 1. Admin Login (Email/Username + Password)
// ----------------------------------------------------
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Username/email and password required" });
        }
        const adminUser = await prisma_1.prisma.adminUser.findFirst({
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
        const isMatch = await bcryptjs_1.default.compare(password, adminUser.user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid administrative credentials" });
        }
        const token = (0, jwt_1.signToken)({
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
    }
    catch (error) {
        console.error("admin login error:", error);
        res.status(500).json({ success: false, message: "Admin login failed" });
    }
});
// All routes below require admin authentication
router.use(auth_middleware_1.authenticateToken);
router.use((0, auth_middleware_1.requireAdmin)(["SUPER_ADMIN", "ORDER_MANAGER", "STAFF"]));
// ----------------------------------------------------
// 2. Orders Management
// ----------------------------------------------------
router.get("/orders", async (req, res) => {
    try {
        const { status, search, page = "1", limit = "20" } = req.query;
        const where = {};
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
            prisma_1.prisma.order.findMany({
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
            prisma_1.prisma.order.count({ where }),
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
});
router.patch("/orders/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid order status" });
        }
        const order = await prisma_1.prisma.order.update({
            where: { id },
            data: { status },
        });
        res.json({ success: true, message: "Order status updated successfully", data: order });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to update order status" });
    }
});
router.patch("/orders/:id/tracking", async (req, res) => {
    try {
        const { id } = req.params;
        const { trackingNumber } = req.body;
        const order = await prisma_1.prisma.order.update({
            where: { id },
            data: {
                trackingNumber,
                status: "DISPATCHED",
            },
        });
        res.json({ success: true, message: "Tracking number assigned", data: order });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to assign tracking number" });
    }
});
// ----------------------------------------------------
// 3. Customer & Wholesale Management (FR-06, FR-09, FR-10, FR-22)
// ----------------------------------------------------
// List all customers (Retail & Wholesale) with filtering, search, and pagination
router.get("/customers", async (req, res) => {
    try {
        const { type = "ALL", status = "ALL", search, page = "1", limit = "20" } = req.query;
        const where = {};
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
            prisma_1.prisma.customerProfile.findMany({
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
                            cart: {
                                include: {
                                    items: true,
                                },
                            },
                        },
                    },
                    addresses: true,
                },
                orderBy: { createdAt: "desc" },
                skip,
                take,
            }),
            prisma_1.prisma.customerProfile.count({ where }),
        ]);
        const formatted = profiles.map((p) => {
            const orders = p.user?.orders || [];
            const totalSpent = orders
                .filter((o) => o.status !== "CANCELLED")
                .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
            const cartItemsCount = p.user?.cart?.items?.reduce((sum, it) => sum + it.quantity, 0) || 0;
            const isLocked = Boolean(p.user?.lockedUntil && new Date(p.user.lockedUntil) > new Date());
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
                cartItemsCount,
                hasActiveCart: cartItemsCount > 0,
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
    }
    catch (error) {
        console.error("fetch customers error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch customers" });
    }
});
// Customer Summary Statistics
router.get("/customers/stats", async (req, res) => {
    try {
        const now = new Date();
        const [total, regular, wholesaleApproved, wholesalePending, locked] = await Promise.all([
            prisma_1.prisma.customerProfile.count(),
            prisma_1.prisma.customerProfile.count({ where: { customerType: "REGULAR" } }),
            prisma_1.prisma.customerProfile.count({
                where: { customerType: "WHOLESALE", approvalStatus: "APPROVED" },
            }),
            prisma_1.prisma.customerProfile.count({
                where: { customerType: "WHOLESALE", approvalStatus: "PENDING" },
            }),
            prisma_1.prisma.user.count({
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch customer stats" });
    }
});
// Create Customer (Retail or Wholesale from Admin)
router.post("/customers", async (req, res) => {
    try {
        const { fullName, phone, email, customerType = "REGULAR", businessName, businessAddress, ownerName, wholesaleCustomerId, } = req.body;
        if (!fullName || !phone) {
            return res.status(400).json({ success: false, message: "Full name and phone number are required" });
        }
        const cleanPhone = String(phone).trim();
        const existingUser = await prisma_1.prisma.user.findFirst({
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
        const newUser = await prisma_1.prisma.user.create({
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
    }
    catch (error) {
        console.error("create customer error:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to create customer" });
    }
});
// Legacy wholesale applications route for compatibility
router.get("/wholesale-applications", async (req, res) => {
    try {
        const { status = "PENDING" } = req.query;
        const profiles = await prisma_1.prisma.customerProfile.findMany({
            where: {
                customerType: "WHOLESALE",
                approvalStatus: status,
            },
            include: {
                user: { select: { id: true, phone: true, email: true, createdAt: true } },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json({ success: true, data: profiles });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch wholesale applications" });
    }
});
router.patch("/wholesale-applications/:id/approve", async (req, res) => {
    try {
        const { id } = req.params;
        const { wholesaleCustomerId } = req.body;
        const profile = await prisma_1.prisma.customerProfile.update({
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to approve wholesale customer" });
    }
});
router.patch("/wholesale-applications/:id/reject", async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await prisma_1.prisma.customerProfile.update({
            where: { id },
            data: { approvalStatus: "REJECTED" },
        });
        res.json({ success: true, message: "Wholesale customer application rejected", data: profile });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to reject application" });
    }
});
// Reset Customer OTP Lockout (supports user id or customer profile id)
router.post("/customers/:id/reset-lockout", async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await prisma_1.prisma.customerProfile.findFirst({
            where: { OR: [{ id }, { userId: id }] },
        });
        const targetUserId = profile ? profile.userId : id;
        const user = await prisma_1.prisma.user.update({
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to clear OTP lockout" });
    }
});
// ----------------------------------------------------
// 5. Toggle Cash on Delivery (FR-23, FR-35)
// ----------------------------------------------------
router.post("/settings/toggle-cod", async (req, res) => {
    try {
        const { enabled } = req.body;
        const setting = await prisma_1.prisma.storeSetting.upsert({
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to toggle Cash on Delivery" });
    }
});
// ----------------------------------------------------
// 6. View-Only Product Catalog (FR-21)
// ----------------------------------------------------
router.get("/products", async (req, res) => {
    try {
        const { search, page = "1", limit = "25" } = req.query;
        const where = {};
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
            prisma_1.prisma.product.findMany({
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
            prisma_1.prisma.product.count({ where }),
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch admin product catalog" });
    }
});
// ----------------------------------------------------
// 7. Dashboard Metrics & Analytics
// ----------------------------------------------------
router.get("/dashboard/metrics", async (req, res) => {
    try {
        const [totalOrders, pendingOrders, totalProducts, pendingWholesale, revenueAgg] = await Promise.all([
            prisma_1.prisma.order.count(),
            prisma_1.prisma.order.count({ where: { status: "PENDING" } }),
            prisma_1.prisma.product.count(),
            prisma_1.prisma.customerProfile.count({ where: { customerType: "WHOLESALE", approvalStatus: "PENDING" } }),
            prisma_1.prisma.order.aggregate({
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch dashboard metrics" });
    }
});
// ----------------------------------------------------
// 8. POS Wholesale Sync Management
// ----------------------------------------------------
router.post("/pos-sync/trigger", async (req, res) => {
    try {
        const pushResult = await (0, posSync_1.pushPendingWholesaleRegistrations)();
        const pullResult = await (0, posSync_1.pullApprovedWholesaleFromPOS)();
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
    }
    catch (error) {
        console.error("pos-sync trigger error:", error);
        res.status(500).json({ success: false, message: error.message || "POS Sync failed" });
    }
});
router.get("/pos-sync/logs", async (req, res) => {
    try {
        const { limit = "20" } = req.query;
        const take = parseInt(String(limit), 10);
        const logs = await prisma_1.prisma.posSyncLog.findMany({
            take,
            orderBy: { createdAt: "desc" },
        });
        res.json({
            success: true,
            data: logs,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch POS sync logs" });
    }
});
// ----------------------------------------------------
// 9. Shopping Cart Management & Abandoned Cart Recovery
// ----------------------------------------------------
router.get("/carts/abandoned", async (req, res) => {
    try {
        const { page = "1", limit = "20" } = req.query;
        const take = Math.max(1, parseInt(String(limit), 10) || 20);
        const skip = (Math.max(1, parseInt(String(page), 10) || 1) - 1) * take;
        const [carts, totalCartsCount] = await Promise.all([
            prisma_1.prisma.cart.findMany({
                where: {
                    items: { some: {} },
                },
                include: {
                    user: {
                        include: {
                            customerProfile: true,
                        },
                    },
                    items: {
                        include: {
                            product: {
                                include: {
                                    images: { where: { isPrimary: true }, take: 1 },
                                    brand: true,
                                    category: true,
                                },
                            },
                        },
                        orderBy: { createdAt: "desc" },
                    },
                },
                orderBy: { updatedAt: "desc" },
                skip,
                take,
            }),
            prisma_1.prisma.cart.count({
                where: { items: { some: {} } },
            }),
        ]);
        const formattedCarts = carts.map((cart) => {
            const isWholesale = cart.user?.customerProfile?.customerType === "WHOLESALE" &&
                cart.user?.customerProfile?.approvalStatus === "APPROVED";
            let cartSubtotal = 0;
            let totalItemCount = 0;
            const items = cart.items.map((item) => {
                const prod = item.product;
                const unitPrice = isWholesale && prod.wholesalePrice !== null
                    ? Number(prod.wholesalePrice)
                    : Number(prod.basePrice);
                const lineTotal = unitPrice * item.quantity;
                cartSubtotal += lineTotal;
                totalItemCount += item.quantity;
                return {
                    id: item.id,
                    productId: prod.id,
                    title: prod.title,
                    sku: prod.sku,
                    quantity: item.quantity,
                    unitPrice,
                    totalPrice: lineTotal,
                    stockQuantity: prod.stockQuantity,
                    image: prod.images[0]?.url || null,
                };
            });
            return {
                id: cart.id,
                userId: cart.userId,
                sessionId: cart.sessionId,
                customerType: cart.user
                    ? cart.user.customerProfile?.customerType || "REGULAR"
                    : "GUEST",
                customerName: cart.user?.customerProfile?.fullName ||
                    cart.user?.customerProfile?.businessName ||
                    "Guest Shopper",
                phone: cart.user?.phone || null,
                email: cart.user?.email || null,
                businessName: cart.user?.customerProfile?.businessName || null,
                wholesaleCustomerId: cart.user?.customerProfile?.wholesaleCustomerId || null,
                itemsCount: totalItemCount,
                subtotal: Math.round(cartSubtotal * 100) / 100,
                items,
                createdAt: cart.createdAt,
                updatedAt: cart.updatedAt,
            };
        });
        const allCartsWithItems = await prisma_1.prisma.cart.findMany({
            where: { items: { some: {} } },
            select: { userId: true },
        });
        const guestCarts = allCartsWithItems.filter((c) => !c.userId).length;
        const customerCarts = allCartsWithItems.filter((c) => Boolean(c.userId)).length;
        res.json({
            success: true,
            data: {
                carts: formattedCarts,
                stats: {
                    totalCarts: totalCartsCount,
                    guestCarts,
                    customerCarts,
                },
                pagination: {
                    page: Math.max(1, parseInt(String(page), 10) || 1),
                    limit: take,
                    totalPages: Math.ceil(totalCartsCount / take),
                },
            },
        });
    }
    catch (error) {
        console.error("admin get carts error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch carts" });
    }
});
router.get("/customers/:id/cart", async (req, res) => {
    try {
        const { id } = req.params;
        const cart = await prisma_1.prisma.cart.findFirst({
            where: {
                OR: [
                    { userId: id },
                    { user: { customerProfile: { id } } },
                ],
            },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                images: { where: { isPrimary: true }, take: 1 },
                            },
                        },
                    },
                },
            },
        });
        if (!cart) {
            return res.json({
                success: true,
                data: {
                    items: [],
                    subtotal: 0,
                    totalItems: 0,
                },
            });
        }
        let subtotal = 0;
        let totalItems = 0;
        const items = cart.items.map((item) => {
            const prod = item.product;
            const unitPrice = Number(prod.basePrice);
            const lineTotal = unitPrice * item.quantity;
            subtotal += lineTotal;
            totalItems += item.quantity;
            return {
                id: item.id,
                productId: prod.id,
                title: prod.title,
                sku: prod.sku,
                quantity: item.quantity,
                unitPrice,
                totalPrice: lineTotal,
                stockQuantity: prod.stockQuantity,
                image: prod.images[0]?.url || null,
            };
        });
        res.json({
            success: true,
            data: {
                id: cart.id,
                items,
                subtotal: Math.round(subtotal * 100) / 100,
                totalItems,
                updatedAt: cart.updatedAt,
            },
        });
    }
    catch (error) {
        console.error("admin customer cart error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch customer cart" });
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map