import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// Get all 25 districts of Sri Lanka
router.get("/districts", async (req: Request, res: Response) => {
  try {
    const districts = await prisma.district.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    });
    res.json({ success: true, data: districts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch districts" });
  }
});

// Get cities for a specific district
router.get("/cities", async (req: Request, res: Response) => {
  try {
    const { districtId, search } = req.query;

    const where: any = {};
    if (districtId) {
      where.districtId = String(districtId);
    }
    if (search) {
      where.name = { contains: String(search), mode: "insensitive" };
    }

    const cities = await prisma.city.findMany({
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
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch cities" });
  }
});

export default router;
