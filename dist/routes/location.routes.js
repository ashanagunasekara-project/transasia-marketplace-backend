"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
// Get all 25 districts of Sri Lanka
router.get("/districts", async (req, res) => {
    try {
        const districts = await prisma_1.prisma.district.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true, code: true },
        });
        res.json({ success: true, data: districts });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch districts" });
    }
});
// Get cities for a specific district
router.get("/cities", async (req, res) => {
    try {
        const { districtId, search } = req.query;
        const where = {};
        if (districtId) {
            where.districtId = String(districtId);
        }
        if (search) {
            where.name = { contains: String(search), mode: "insensitive" };
        }
        const cities = await prisma_1.prisma.city.findMany({
            where,
            include: {
                district: { select: { id: true, name: true } },
            },
            orderBy: { name: "asc" },
            take: 100,
        });
        res.json({
            success: true,
            data: cities.map((c) => ({
                id: c.id,
                name: c.name,
                postalCode: c.postalCode,
                districtId: c.districtId,
                districtName: c.district.name,
                displayName: `${c.name} (${c.district.name})`, // Disambiguate duplicate city names across districts (FR-32)
            })),
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch cities" });
    }
});
exports.default = router;
//# sourceMappingURL=location.routes.js.map