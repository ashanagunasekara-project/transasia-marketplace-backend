
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
const router = Router();
// Default Hero Banners (Fallback from collections data)
// Default Hero Banners (Fallback from collections data)
const defaultHeroBanners = [
    {
        id: "1",
        subtitle: "Exclusive Offer Going",
        title: "GOPRO\nHERO 10",
        oldPrice: 2364.56,
        price: 243.55,
        savePercent: "30%",
        imgSrc: "/assets/images/product-banner/product-banner-img-17.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-17.webp",
        width: 648,
        height: 454,
        link: "/shop",
        btnText: "SHOP NOW",
        hasCurvedPortion: false,
        order: 1,
    },
    {
        id: "2",
        subtitle: "Limited Weekend Deal",
        title: "OSMO MINI\nPRO",
        oldPrice: 2439.61,
        price: 248.84,
        savePercent: "30%",
        imgSrc: "/assets/images/product-banner/product-banner-img-18.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-18.webp",
        width: 646,
        height: 454,
        link: "/shop",
        btnText: "SHOP NOW",
        hasCurvedPortion: true,
        order: 2,
    },
    {
        id: "3",
        subtitle: "Limited Weekend Deal",
        title: "AIRPODS\nPRO",
        oldPrice: 2506.44,
        price: 253.15,
        savePercent: "30%",
        imgSrc: "/assets/images/product-banner/product-banner-img-20.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-20.webp",
        width: 1290,
        height: 908,
        link: "/shop",
        btnText: "SHOP NOW",
        hasCurvedPortion: false,
        order: 3,
    },
    {
        id: "4",
        subtitle: "Exclusive Offer Going",
        title: "DSLR\nPERFORS",
        oldPrice: 2576.1,
        price: 257.61,
        savePercent: "30%",
        imgSrc: "/assets/images/product-banner/product-banner-img-19.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-19.webp",
        width: 1290,
        height: 908,
        link: "/shop",
        btnText: "SHOP NOW",
        hasCurvedPortion: true,
        order: 4,
    },
    {
        id: "5",
        subtitle: "Exclusive Offer Going",
        title: "IPAD\nPRO M1",
        oldPrice: 2657.27,
        price: 263.07,
        savePercent: "30%",
        imgSrc: "/assets/images/product-banner/product-banner-img-21.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-21.webp",
        width: 1296,
        height: 908,
        link: "/shop",
        btnText: "SHOP NOW",
        hasCurvedPortion: false,
        order: 5,
    },
    {
        id: "6",
        subtitle: "Limited Weekend Deal",
        title: "MACBOOK\nPRO M1",
        oldPrice: 2728.37,
        price: 267.38,
        savePercent: "30%",
        imgSrc: "/assets/images/product-banner/product-banner-img-22.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-22.webp",
        width: 1296,
        height: 908,
        link: "/shop",
        btnText: "SHOP NOW",
        hasCurvedPortion: true,
        order: 6,
    },
];
// Default Popular Categories (Fallback from categories data)
const defaultPopularCategories = {
    sectionTitle: "Popular By Categories",
    viewAllLink: "/categories",
    categories: [
        {
            id: "1",
            title: "Camera & Photo",
            imgSrc: "/assets/images/catagory-img/cat-transp-img-07.webp",
            link: "/shop-by-category",
            subCategories: [
                { title: "Digital Cameras", href: "/shop-by-category" },
                { title: "Camera Accessories", href: "/shop-by-category" },
                { title: "Lenses", href: "/shop-by-category" },
            ],
        },
        {
            id: "2",
            title: "Smartwatches",
            imgSrc: "/assets/images/catagory-img/cat-transp-img-08.webp",
            link: "/shop-by-category",
            subCategories: [
                { title: "Fitness Trackers", href: "/shop-by-category" },
                { title: "Smart Accessories", href: "/shop-by-category" },
                { title: "Wearable Tech", href: "/shop-by-category" },
            ],
        },
        {
            id: "3",
            title: "TVs, Audio-Video",
            imgSrc: "/assets/images/catagory-img/cat-transp-img-09.webp",
            link: "/shop-by-category",
            subCategories: [
                { title: "Televisions", href: "/shop-by-category" },
                { title: "Sound Systems", href: "/shop-by-category" },
                { title: "Streaming Devices", href: "/shop-by-category" },
            ],
        },
        {
            id: "4",
            title: "Goods for Games",
            imgSrc: "/assets/images/catagory-img/cat-transp-img-12.webp",
            link: "/shop-by-category",
            subCategories: [
                { title: "Gaming Consoles", href: "/shop-by-category" },
                { title: "Gaming Accessories", href: "/shop-by-category" },
                { title: "Video Games", href: "/shop-by-category" },
            ],
        },
        {
            id: "5",
            title: "Headphones",
            imgSrc: "/assets/images/catagory-img/cat-transp-img-10.webp",
            link: "/shop-by-category",
            subCategories: [
                { title: "Headphones", href: "/shop-by-category" },
                { title: "Speakers", href: "/shop-by-category" },
                { title: "Music Accessories", href: "/shop-by-category" },
            ],
        },
        {
            id: "6",
            title: "House Appliances",
            imgSrc: "/assets/images/catagory-img/cat-transp-img-11.webp",
            link: "/shop-by-category",
            subCategories: [
                { title: "Kitchen Appliances", href: "/shop-by-category" },
                { title: "Cleaning Appliances", href: "/shop-by-category" },
                { title: "Home Comfort", href: "/shop-by-category" },
            ],
        },
    ],
    dealBanner: {
        subtitle: "Weekend Deal",
        title: "DJI Ronin Action",
        secondaryTitle: "Super holiday",
        imgSrc: "/assets/images/catagory-img/banner-cat-01.webp",
        link: "/shop",
    },
};
// =========================================================
// 1. HERO BANNERS ENDPOINTS
// =========================================================
// GET /api/banners/hero
router.get("/hero", async (req: Request, res: Response) => {
    try {
        const setting = await prisma.storeSetting.findUnique({
            where: { key: "home_hero_banners" },
        });
        if (!setting || !setting.value) {
            return res.json({
                success: true,
                data: defaultHeroBanners,
                autoShift: true,
                autoShiftDelay: 3500,
            });
        }
        const value = setting.value as any;
        res.json({
            success: true,
            data: value.banners || defaultHeroBanners,
            autoShift: value.autoShift !== undefined ? value.autoShift : true,
            autoShiftDelay: value.autoShiftDelay || 3500,
        });
    } catch (error: any) {
        console.error("fetch hero banners error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch hero banners" });
    }
});
// PUT /api/banners/hero (Save all hero banners + autoShift setting)
router.put("/hero", async (req: Request, res: Response) => {
    try {
        const { banners, autoShift = true, autoShiftDelay = 3500 } = req.body;
        if (!Array.isArray(banners)) {
            return res.status(400).json({ success: false, message: "Banners must be an array" });
        }
        const saved = await prisma.storeSetting.upsert({
            where: { key: "home_hero_banners" },
            update: {
                value: {
                    banners,
                    autoShift: Boolean(autoShift),
                    autoShiftDelay: Number(autoShiftDelay) || 3500,
                },
            },
            create: {
                key: "home_hero_banners",
                value: {
                    banners,
                    autoShift: Boolean(autoShift),
                    autoShiftDelay: Number(autoShiftDelay) || 3500,
                },
                description: "Configurable hero banners for storefront home page",
            },
        });
        res.json({
            success: true,
            message: "Hero banners updated successfully",
            data: (saved.value as any).banners,
            autoShift: (saved.value as any).autoShift,
            autoShiftDelay: (saved.value as any).autoShiftDelay,
        });
    } catch (error: any) {
        console.error("update hero banners error:", error);
        res.status(500).json({ success: false, message: "Failed to update hero banners" });
    }
});
// =========================================================
// 2. POPULAR BY CATEGORIES ENDPOINTS
// =========================================================
// GET /api/banners/popular-categories
router.get("/popular-categories", async (req: Request, res: Response) => {
    try {
        const setting = await prisma.storeSetting.findUnique({
            where: { key: "home_popular_categories" },
        });
        if (!setting || !setting.value) {
            return res.json({
                success: true,
                data: defaultPopularCategories,
            });
        }
        const value = setting.value as any;
        res.json({
            success: true,
            data: {
                sectionTitle: value.sectionTitle || defaultPopularCategories.sectionTitle,
                viewAllLink: value.viewAllLink || defaultPopularCategories.viewAllLink,
                categories: value.categories || defaultPopularCategories.categories,
                dealBanner: value.dealBanner || defaultPopularCategories.dealBanner,
            },
        });
    } catch (error: any) {
        console.error("fetch popular categories error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch popular categories" });
    }
});
// PUT /api/banners/popular-categories
router.put("/popular-categories", async (req: Request, res: Response) => {
    try {
        const { sectionTitle, viewAllLink, categories, dealBanner } = req.body;
        if (categories && !Array.isArray(categories)) {
            return res.status(400).json({ success: false, message: "Categories must be an array" });
        }
        const payload = {
            sectionTitle: sectionTitle || "Popular By Categories",
            viewAllLink: viewAllLink || "/categories",
            categories: categories || defaultPopularCategories.categories,
            dealBanner: dealBanner || defaultPopularCategories.dealBanner,
        };
        const saved = await prisma.storeSetting.upsert({
            where: { key: "home_popular_categories" },
            update: {
                value: payload,
            },
            create: {
                key: "home_popular_categories",
                value: payload,
                description: "Configurable popular categories and side deal banner on home page",
            },
        });
        res.json({
            success: true,
            message: "Popular categories updated successfully",
            data: saved.value,
        });
    } catch (error: any) {
        console.error("update popular categories error:", error);
        res.status(500).json({ success: false, message: "Failed to update popular categories" });
    }
});

// =========================================================
// 3. TOPBAR ANNOUNCEMENT TICKER ENDPOINTS
// =========================================================

const defaultTopbar = {
    enabled: true,
    delay: 2000,
    slides: [
        { id: "1", text: "The best-selling watch —all under $100.", linkText: "Shop Now", link: "/shop" },
        { id: "2", text: "The best-selling camera —all under $100.", linkText: "Shop Now", link: "/shop" },
        { id: "3", text: "The best-selling mobile —all under $100.", linkText: "Shop Now", link: "/shop" },
    ],
};

// GET /api/banners/topbar
router.get("/topbar", async (req: Request, res: Response) => {
    try {
        const setting = await prisma.storeSetting.findUnique({
            where: { key: "home_topbar_ticker" },
        });

        if (!setting || !setting.value) {
            return res.json({
                success: true,
                data: defaultTopbar,
            });
        }

        const value = setting.value as any;
        res.json({
            success: true,
            data: {
                enabled: value.enabled !== undefined ? value.enabled : defaultTopbar.enabled,
                delay: value.delay || defaultTopbar.delay,
                slides: value.slides || defaultTopbar.slides,
            },
        });
    } catch (error: any) {
        console.error("fetch topbar ticker error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch topbar ticker" });
    }
});

// PUT /api/banners/topbar
router.put("/topbar", async (req: Request, res: Response) => {
    try {
        const { enabled = true, delay = 2000, slides } = req.body;

        if (slides && !Array.isArray(slides)) {
            return res.status(400).json({ success: false, message: "Slides must be an array" });
        }

        const payload = {
            enabled: Boolean(enabled),
            delay: Number(delay) || 2000,
            slides: slides || defaultTopbar.slides,
        };

        const saved = await prisma.storeSetting.upsert({
            where: { key: "home_topbar_ticker" },
            update: { value: payload },
            create: {
                key: "home_topbar_ticker",
                value: payload,
                description: "Configurable topbar ticker announcement texts and links",
            },
        });

        res.json({
            success: true,
            message: "Topbar ticker updated successfully",
            data: saved.value,
        });
    } catch (error: any) {
        console.error("update topbar ticker error:", error);
        res.status(500).json({ success: false, message: "Failed to update topbar ticker" });
    }
});

// =========================================================
// 4. PROMOTIONAL BANNERS & DEALS VISIBILITY ENDPOINTS
// =========================================================

const defaultHighlightsProducts = [
    {
        id: "153",
        title: "Beats Studio Pro Wireless Earbuds – Black",
        oldPrice: 83.41,
        price: 66.98,
        imgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-01.webp",
        mobileImgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-01.webp",
        rating: 5,
        ratingCount: 39,
        link: "/product/153",
    },
    {
        id: "154",
        title: "Apple 12.9-inch iPad Pro Wi-Fi 512GB Gray Space",
        oldPrice: 54.66,
        price: 43.84,
        imgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-02.webp",
        mobileImgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-02.webp",
        rating: 3,
        ratingCount: 76,
        link: "/product/154",
    },
    {
        id: "155",
        title: "DJI OM 5 Handheld Smartphone Gimbal",
        oldPrice: 90.07,
        price: 72.15,
        imgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-03.webp",
        mobileImgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-03.webp",
        rating: 4,
        ratingCount: 113,
        link: "/product/155",
    },
    {
        id: "156",
        title: "Apple Watch Ultra 2 – Titanium Case",
        oldPrice: 72.47,
        price: 57.98,
        imgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-04.webp",
        mobileImgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-04.webp",
        rating: 3,
        ratingCount: 150,
        link: "/product/156",
    },
    {
        id: "157",
        title: "Apple MacBook Pro 16-inch – M2 Chip",
        oldPrice: 95.09,
        price: 75.98,
        imgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-05.webp",
        mobileImgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-05.webp",
        rating: 5,
        ratingCount: 187,
        link: "/product/157",
    },
    {
        id: "158",
        title: "Apple iPad Air 10.9-inch – Wi-Fi 256GB",
        oldPrice: 99.09,
        price: 79.07,
        imgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-06.webp",
        mobileImgSrc: "/assets/images/product-img/electronics/electronics-bg-trans-list-06.webp",
        rating: 5,
        ratingCount: 224,
        link: "/product/158",
    },
];

const defaultPromotions = {
    powerUpBanner: {
        subtitle: "Power Up Deals",
        titleBold: "New Device",
        titleRegular: "coming Soon",
        secondarySubtitle: "Land major deals",
        imgSrc: "/assets/images/product-banner/product-banner-img-01.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-01.webp",
        btnText: "SHOP NOW",
        link: "/shop",
    },
    highlightsBanner: {
        sectionTitle: "This Week’s Highlights",
        subtitle: "Power Up Deals",
        titleBold: "Red Camera",
        titleRegular: "Plus",
        secondarySubtitle: "Holiday Cheers",
        imgSrc: "/assets/images/product-banner/product-banner-img-02.webp",
        mobileImgSrc: "/assets/images/product-banner/product-banner-img-02.webp",
        btnText: "SHOP NOW",
        link: "/shop",
    },
    highlightsProducts: defaultHighlightsProducts,
    showTodaysBestDeals: false, // User requested: "Today's Best Deals temopory hidden: Figger 02"
};

// GET /api/banners/promotions
router.get("/promotions", async (req: Request, res: Response) => {
    try {
        const setting = await prisma.storeSetting.findUnique({
            where: { key: "home_promotional_banners" },
        });

        if (!setting || !setting.value) {
            return res.json({
                success: true,
                data: defaultPromotions,
            });
        }

        const value = setting.value as any;
        res.json({
            success: true,
            data: {
                powerUpBanner: value.powerUpBanner || defaultPromotions.powerUpBanner,
                highlightsBanner: value.highlightsBanner || defaultPromotions.highlightsBanner,
                highlightsProducts: Array.isArray(value.highlightsProducts) && value.highlightsProducts.length > 0
                    ? value.highlightsProducts.slice(0, 6)
                    : defaultPromotions.highlightsProducts,
                showTodaysBestDeals: value.showTodaysBestDeals !== undefined ? value.showTodaysBestDeals : defaultPromotions.showTodaysBestDeals,
            },
        });
    } catch (error: any) {
        console.error("fetch promotional banners error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch promotional banners" });
    }
});

// PUT /api/banners/promotions
router.put("/promotions", async (req: Request, res: Response) => {
    try {
        const { powerUpBanner, highlightsBanner, highlightsProducts, showTodaysBestDeals } = req.body;

        const payload = {
            powerUpBanner: powerUpBanner || defaultPromotions.powerUpBanner,
            highlightsBanner: highlightsBanner || defaultPromotions.highlightsBanner,
            highlightsProducts: Array.isArray(highlightsProducts)
                ? highlightsProducts.slice(0, 6)
                : defaultPromotions.highlightsProducts,
            showTodaysBestDeals: showTodaysBestDeals !== undefined ? Boolean(showTodaysBestDeals) : defaultPromotions.showTodaysBestDeals,
        };

        const saved = await prisma.storeSetting.upsert({
            where: { key: "home_promotional_banners" },
            update: { value: payload },
            create: {
                key: "home_promotional_banners",
                value: payload,
                description: "Configurable promotional banners, highlights products, and Today's Best Deals visibility",
            },
        });

        res.json({
            success: true,
            message: "Promotional banners updated successfully",
            data: saved.value,
        });
    } catch (error: any) {
        console.error("update promotional banners error:", error);
        res.status(500).json({ success: false, message: "Failed to update promotional banners" });
    }
});

export default router;