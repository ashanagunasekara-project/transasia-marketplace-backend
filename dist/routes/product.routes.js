"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../lib/jwt");
const router = (0, express_1.Router)();
function generateSlug(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
async function determineWholesalePricing(req) {
    const customHeaderView = req.headers["x-customer-view"]?.toUpperCase();
    if (customHeaderView === "REGULAR") {
        // Explicitly requested regular/retail view: always return standard retail price
        return false;
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const decoded = (0, jwt_1.verifyToken)(authHeader.split(" ")[1]);
            if (decoded.activeView === "REGULAR" && customHeaderView !== "WHOLESALE") {
                return false;
            }
            const profile = await prisma_1.prisma.customerProfile.findUnique({
                where: { userId: decoded.userId },
            });
            const isApproved = Boolean(profile?.businessName || profile?.customerType === "WHOLESALE" || profile?.wholesaleCustomerId) &&
                profile?.approvalStatus === "APPROVED";
            if (customHeaderView === "WHOLESALE") {
                return isApproved;
            }
            return isApproved && decoded.activeView !== "REGULAR";
        }
        catch (e) {
            return false;
        }
    }
    return false;
}
function formatStockAndPrice(product, isApprovedWholesale) {
    // Stock Display Rules (FR-27, FR-28)
    const exactStock = product.stockQuantity;
    let displayStock = exactStock;
    let stockLabel = `${exactStock} Available`;
    if (exactStock > 20) {
        displayStock = 20; // Cap visual number
        stockLabel = "20+ Qty Available";
    }
    else if (exactStock <= 0) {
        displayStock = 0;
        stockLabel = "Out of Stock";
    }
    // Pricing Rules (FR-07, FR-08)
    const retailPrice = Number(product.basePrice);
    const wholesalePrice = product.wholesalePrice ? Number(product.wholesalePrice) : retailPrice;
    const effectivePrice = isApprovedWholesale ? wholesalePrice : retailPrice;
    return {
        id: product.id,
        sku: product.sku,
        posItemCode: product.posItemCode,
        title: product.title,
        slug: product.slug,
        description: product.description,
        price: effectivePrice,
        retailPrice,
        wholesalePrice: isApprovedWholesale ? wholesalePrice : undefined,
        isWholesalePricingApplied: isApprovedWholesale,
        stockQuantity: displayStock,
        stockLabel,
        isAvailable: exactStock > 0,
        category: product.category,
        brand: product.brand,
        images: product.images,
        primaryImage: product.images.find((img) => img.isPrimary)?.url || product.images[0]?.url || "/assets/images/placeholder.webp",
        createdAt: product.createdAt,
        salesCount: product._count?.orderItems ?? 0,
    };
}
// ----------------------------------------------------
// 1. Admin List All Products (All statuses, formatted for Admin Table)
// ----------------------------------------------------
router.get("/admin/all", async (req, res) => {
    try {
        const products = await prisma_1.prisma.product.findMany({
            include: {
                category: true,
                brand: true,
                images: { orderBy: { sortOrder: "asc" } },
            },
            orderBy: { createdAt: "desc" },
        });
        const formatted = products.map((p) => {
            let adminStatus = "published";
            if (p.status === "DRAFT") {
                adminStatus = "draft";
            }
            else if (p.stockQuantity <= 10 && p.stockQuantity > 0) {
                adminStatus = "low stock";
            }
            else if (p.status === "OUT_OF_STOCK" || p.stockQuantity <= 0) {
                adminStatus = "draft";
            }
            const primaryImg = p.images.find((img) => img.isPrimary)?.url || p.images[0]?.url || "/assets/images/products/organic-food-a-01.webp";
            return {
                id: p.id,
                sku: p.sku,
                name: p.title,
                title: p.title,
                slug: p.slug,
                category: p.category?.title || "Unassigned",
                categoryId: p.categoryId,
                brand: p.brand?.name || "Unassigned",
                brandId: p.brandId,
                price: Number(p.basePrice),
                basePrice: Number(p.basePrice),
                wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : null,
                stock: p.stockQuantity,
                stockQuantity: p.stockQuantity,
                status: adminStatus,
                rawStatus: p.status,
                image: primaryImg,
                images: p.images,
                description: p.description,
                posItemCode: p.posItemCode,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
            };
        });
        res.json({
            success: true,
            data: formatted,
            totalCount: formatted.length,
        });
    }
    catch (error) {
        console.error("Admin products error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch admin products" });
    }
});
// ----------------------------------------------------
// 2. List Products for Storefront (Filtered, Paginated, Active only)
// ----------------------------------------------------
router.get("/", async (req, res) => {
    try {
        const { category, brand, search, minPrice, maxPrice, page = "1", limit = "12", sort = "newest", } = req.query;
        const isApprovedWholesale = await determineWholesalePricing(req);
        const where = { status: "ACTIVE" };
        if (category) {
            where.category = { slug: String(category) };
        }
        if (brand) {
            where.brand = { slug: String(brand) };
        }
        if (search) {
            where.OR = [
                { title: { contains: String(search), mode: "insensitive" } },
                { description: { contains: String(search), mode: "insensitive" } },
                { sku: { contains: String(search), mode: "insensitive" } },
            ];
        }
        if (minPrice || maxPrice) {
            where.basePrice = {};
            if (minPrice)
                where.basePrice.gte = parseFloat(String(minPrice));
            if (maxPrice)
                where.basePrice.lte = parseFloat(String(maxPrice));
        }
        let orderBy = { createdAt: "desc" };
        if (sort === "price-low")
            orderBy = { basePrice: "asc" };
        if (sort === "price-high")
            orderBy = { basePrice: "desc" };
        if (sort === "popular")
            orderBy = { stockQuantity: "desc" };
        const take = parseInt(String(limit), 10);
        const skip = (parseInt(String(page), 10) - 1) * take;
        const [products, totalCount] = await Promise.all([
            prisma_1.prisma.product.findMany({
                where,
                include: {
                    category: true,
                    brand: true,
                    images: { orderBy: { sortOrder: "asc" } },
                    _count: { select: { orderItems: true } },
                },
                orderBy,
                skip,
                take,
            }),
            prisma_1.prisma.product.count({ where }),
        ]);
        const formattedProducts = products.map((p) => formatStockAndPrice(p, isApprovedWholesale));
        res.json({
            success: true,
            data: formattedProducts,
            pagination: {
                page: parseInt(String(page), 10),
                limit: take,
                totalCount,
                totalPages: Math.ceil(totalCount / take),
            },
        });
    }
    catch (error) {
        console.error("products list error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
});
// ----------------------------------------------------
// 3. Create a new Product
// ----------------------------------------------------
router.post("/", async (req, res) => {
    try {
        const { title, name, sku: inputSku, posItemCode, slug: inputSlug, description, price, basePrice, wholesalePrice, stockQuantity, stock, status = "ACTIVE", categoryId, brandId, image, images = [], } = req.body;
        const productTitle = title || name;
        if (!productTitle) {
            return res.status(400).json({ success: false, message: "Product title/name is required" });
        }
        const effectiveBasePrice = parseFloat(String(basePrice ?? price ?? 0));
        if (isNaN(effectiveBasePrice) || effectiveBasePrice < 0) {
            return res.status(400).json({ success: false, message: "Valid base price is required" });
        }
        const effectiveStock = parseInt(String(stockQuantity ?? stock ?? 0), 10);
        // Generate unique SKU if not provided
        let sku = inputSku?.trim();
        if (!sku) {
            sku = `TA-${Math.floor(1000 + Math.random() * 9000)}`;
        }
        // Check SKU collision
        const existingSku = await prisma_1.prisma.product.findUnique({ where: { sku } });
        if (existingSku) {
            sku = `${sku}-${Math.floor(100 + Math.random() * 900)}`;
        }
        // Generate unique slug
        let slug = inputSlug ? generateSlug(inputSlug) : generateSlug(productTitle);
        const existingSlug = await prisma_1.prisma.product.findUnique({ where: { slug } });
        if (existingSlug) {
            slug = `${slug}-${Date.now().toString().slice(-4)}`;
        }
        // Build image records
        const imageRecords = [];
        if (image) {
            imageRecords.push({ url: image, isPrimary: true, sortOrder: 0 });
        }
        if (Array.isArray(images)) {
            images.forEach((url, index) => {
                if (url && url !== image) {
                    imageRecords.push({
                        url,
                        isPrimary: imageRecords.length === 0,
                        sortOrder: imageRecords.length,
                    });
                }
            });
        }
        // Map status string
        let productStatus = "ACTIVE";
        if (String(status).toLowerCase() === "draft") {
            productStatus = "DRAFT";
        }
        else if (String(status).toLowerCase() === "archived" || String(status).toLowerCase() === "out_of_stock") {
            productStatus = "OUT_OF_STOCK";
        }
        const newProduct = await prisma_1.prisma.product.create({
            data: {
                title: productTitle,
                sku,
                posItemCode: posItemCode || null,
                slug,
                description: description || null,
                basePrice: effectiveBasePrice,
                wholesalePrice: wholesalePrice ? parseFloat(String(wholesalePrice)) : null,
                stockQuantity: effectiveStock,
                status: productStatus,
                isPosSynced: false,
                categoryId: categoryId || null,
                brandId: brandId || null,
                images: imageRecords.length > 0 ? { create: imageRecords } : undefined,
            },
            include: {
                category: true,
                brand: true,
                images: true,
            },
        });
        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: {
                ...newProduct,
                name: newProduct.title,
                price: Number(newProduct.basePrice),
                stock: newProduct.stockQuantity,
                category: newProduct.category?.title || "Unassigned",
                image: newProduct.images[0]?.url || "/assets/images/placeholder.webp",
            },
        });
    }
    catch (error) {
        console.error("Create product error:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to create product" });
    }
});
// ----------------------------------------------------
// 4. Update an existing Product
// ----------------------------------------------------
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, name, sku: inputSku, posItemCode, slug: inputSlug, description, price, basePrice, wholesalePrice, stockQuantity, stock, status, categoryId, brandId, image, images, } = req.body;
        const existing = await prisma_1.prisma.product.findUnique({
            where: { id },
            include: { images: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        const updateData = {};
        if (title || name)
            updateData.title = title || name;
        if (inputSku)
            updateData.sku = inputSku;
        if (posItemCode !== undefined)
            updateData.posItemCode = posItemCode || null;
        if (description !== undefined)
            updateData.description = description;
        if (basePrice !== undefined || price !== undefined) {
            updateData.basePrice = parseFloat(String(basePrice ?? price));
        }
        if (wholesalePrice !== undefined) {
            updateData.wholesalePrice = wholesalePrice ? parseFloat(String(wholesalePrice)) : null;
        }
        if (stockQuantity !== undefined || stock !== undefined) {
            updateData.stockQuantity = parseInt(String(stockQuantity ?? stock), 10);
        }
        if (categoryId !== undefined)
            updateData.categoryId = categoryId || null;
        if (brandId !== undefined)
            updateData.brandId = brandId || null;
        if (status) {
            if (String(status).toLowerCase() === "draft") {
                updateData.status = "DRAFT";
            }
            else if (String(status).toLowerCase() === "archived" || String(status).toLowerCase() === "out_of_stock") {
                updateData.status = "OUT_OF_STOCK";
            }
            else {
                updateData.status = "ACTIVE";
            }
        }
        // Update images if provided
        if (image !== undefined || images !== undefined) {
            // Clear existing images and create new ones
            await prisma_1.prisma.productImage.deleteMany({ where: { productId: id } });
            const imageRecords = [];
            if (image) {
                imageRecords.push({ url: image, isPrimary: true, sortOrder: 0 });
            }
            if (Array.isArray(images)) {
                images.forEach((url) => {
                    if (url && url !== image) {
                        imageRecords.push({
                            url,
                            isPrimary: imageRecords.length === 0,
                            sortOrder: imageRecords.length,
                        });
                    }
                });
            }
            if (imageRecords.length > 0) {
                updateData.images = { create: imageRecords };
            }
        }
        const updated = await prisma_1.prisma.product.update({
            where: { id },
            data: updateData,
            include: {
                category: true,
                brand: true,
                images: true,
            },
        });
        res.json({
            success: true,
            message: "Product updated successfully",
            data: {
                ...updated,
                name: updated.title,
                price: Number(updated.basePrice),
                stock: updated.stockQuantity,
                category: updated.category?.title || "Unassigned",
                image: updated.images[0]?.url || "/assets/images/placeholder.webp",
            },
        });
    }
    catch (error) {
        console.error("Update product error:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to update product" });
    }
});
// ----------------------------------------------------
// 5. Delete a Product
// ----------------------------------------------------
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        // Check if product exists (can match by ID or SKU)
        const product = await prisma_1.prisma.product.findFirst({
            where: {
                OR: [{ id }, { sku: id }],
            },
        });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        // Delete associated images first (if not cascading)
        await prisma_1.prisma.productImage.deleteMany({ where: { productId: product.id } });
        // Delete product
        await prisma_1.prisma.product.delete({ where: { id: product.id } });
        res.json({ success: true, message: "Product deleted successfully" });
    }
    catch (error) {
        console.error("Delete product error:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to delete product" });
    }
});
// ----------------------------------------------------
// 6. Get Single Product by Slug or ID (Storefront & Admin)
// ----------------------------------------------------
router.get("/:identifier", async (req, res) => {
    try {
        const { identifier } = req.params;
        const isApprovedWholesale = await determineWholesalePricing(req);
        const product = await prisma_1.prisma.product.findFirst({
            where: {
                OR: [{ id: identifier }, { slug: identifier }, { sku: identifier }],
            },
            include: {
                category: true,
                brand: true,
                images: { orderBy: { sortOrder: "asc" } },
                _count: { select: { orderItems: true } },
            },
        });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        res.json({
            success: true,
            data: formatStockAndPrice(product, isApprovedWholesale),
        });
    }
    catch (error) {
        console.error("get product error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch product" });
    }
});
exports.default = router;
//# sourceMappingURL=product.routes.js.map