"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    try {
        const brands = await prisma_1.prisma.brand.findMany({
            include: {
                _count: { select: { products: true } },
            },
            orderBy: { name: "asc" },
        });
        res.json({
            success: true,
            data: brands.map((b) => ({
                id: b.id,
                name: b.name,
                slug: b.slug,
                imgSrc: b.imgSrc,
                discount: b.discountText || "Exclusive Deals",
                productCount: b._count.products,
            })),
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch brands" });
    }
});
exports.default = router;
//# sourceMappingURL=brand.routes.js.map