import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const brands = await prisma.brand.findMany({
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
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch brands" });
  }
});

export default router;
