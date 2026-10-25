import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/public", async (req: Request, res: Response) => {
  try {
    const settings = await prisma.storeSetting.findMany({
      where: {
        key: {
          in: [
            "cod_enabled",
            "store_pickup_locations",
            "store_contact",
            "otp_max_retries",
            "site_logo",
            "store_profile",
            "shipping_rates",
          ],
        },
      },
    });

    const settingsMap: Record<string, any> = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      success: true,
      data: {
        codEnabled: settingsMap.cod_enabled?.enabled ?? false,
        pickupLocations: settingsMap.store_pickup_locations ?? [
          { id: "colombo", name: "Colombo TransAsia Head Office" },
          { id: "kurunegala", name: "Kurunegala Branch" },
        ],
        hotline: "077 339 2727",
        logoUrl: settingsMap.site_logo?.url || "/assets/images/logo/logo.webp",
        storeName: settingsMap.store_profile?.storeName || "Transasia",
        shippingRates: settingsMap.shipping_rates ?? {
          colomboCourierFee: 350,
          outOfColomboCourierFee: 450,
          freeShippingThreshold: 15000,
          enableFreeShipping: true,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch store settings" });
  }
});

router.get("/shipping", async (req: Request, res: Response) => {
  try {
    const setting = await prisma.storeSetting.findUnique({
      where: { key: "shipping_rates" },
    });

    const data = (setting?.value as any) || {
      colomboCourierFee: 350,
      outOfColomboCourierFee: 450,
      freeShippingThreshold: 15000,
      enableFreeShipping: true,
      processingTime: "1-2 business days",
    };

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch shipping settings" });
  }
});

router.put("/shipping", async (req: Request, res: Response) => {
  try {
    const {
      colomboCourierFee,
      outOfColomboCourierFee,
      freeShippingThreshold,
      enableFreeShipping,
      processingTime,
    } = req.body;

    const saved = await prisma.storeSetting.upsert({
      where: { key: "shipping_rates" },
      update: {
        value: {
          colomboCourierFee: Number(colomboCourierFee) || 350,
          outOfColomboCourierFee: Number(outOfColomboCourierFee) || 450,
          freeShippingThreshold: Number(freeShippingThreshold) || 15000,
          enableFreeShipping: enableFreeShipping !== undefined ? Boolean(enableFreeShipping) : true,
          processingTime: processingTime || "1-2 business days",
        },
      },
      create: {
        key: "shipping_rates",
        value: {
          colomboCourierFee: Number(colomboCourierFee) || 350,
          outOfColomboCourierFee: Number(outOfColomboCourierFee) || 450,
          freeShippingThreshold: Number(freeShippingThreshold) || 15000,
          enableFreeShipping: enableFreeShipping !== undefined ? Boolean(enableFreeShipping) : true,
          processingTime: processingTime || "1-2 business days",
        },
        description: "Configurable Sri Lanka courier rates and free shipping rules",
      },
    });

    res.json({
      success: true,
      message: "Shipping rates updated successfully",
      data: saved.value,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to update shipping rates" });
  }
});

router.get("/branding", async (req: Request, res: Response) => {
  try {
    const logoSetting = await prisma.storeSetting.findUnique({
      where: { key: "site_logo" },
    });
    const profileSetting = await prisma.storeSetting.findUnique({
      where: { key: "store_profile" },
    });

    res.json({
      success: true,
      data: {
        logoUrl: (logoSetting?.value as any)?.url || "/assets/images/logo/logo.webp",
        altText: (logoSetting?.value as any)?.alt || "Transasia Logo",
        storeName: (profileSetting?.value as any)?.storeName || "Transasia",
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch branding settings" });
  }
});

router.put("/branding", async (req: Request, res: Response) => {
  try {
    const { logoUrl, altText, storeName } = req.body;

    if (logoUrl !== undefined) {
      await prisma.storeSetting.upsert({
        where: { key: "site_logo" },
        update: {
          value: {
            url: logoUrl,
            alt: altText || "Transasia Logo",
          },
        },
        create: {
          key: "site_logo",
          value: {
            url: logoUrl,
            alt: altText || "Transasia Logo",
          },
          description: "Configurable storefront logo",
        },
      });
    }

    if (storeName !== undefined) {
      await prisma.storeSetting.upsert({
        where: { key: "store_profile" },
        update: {
          value: { storeName },
        },
        create: {
          key: "store_profile",
          value: { storeName },
          description: "Store profile information",
        },
      });
    }

    res.json({
      success: true,
      message: "Branding settings updated successfully",
      data: {
        logoUrl: logoUrl || "/assets/images/logo/logo.webp",
        storeName: storeName || "Transasia",
      },
    });
  } catch (error: any) {
    console.error("update branding error:", error);
    res.status(500).json({ success: false, message: "Failed to update branding settings" });
  }
});

// Also support POST for form-based updates
router.post("/branding", async (req: Request, res: Response) => {
  try {
    const { logoUrl, altText, storeName } = req.body;

    if (logoUrl !== undefined) {
      await prisma.storeSetting.upsert({
        where: { key: "site_logo" },
        update: {
          value: {
            url: logoUrl,
            alt: altText || "Transasia Logo",
          },
        },
        create: {
          key: "site_logo",
          value: {
            url: logoUrl,
            alt: altText || "Transasia Logo",
          },
          description: "Configurable storefront logo",
        },
      });
    }

    res.json({
      success: true,
      message: "Branding settings saved successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to update branding settings" });
  }
});

export default router;
