import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting TransAsia database seeding...");

  // 1. Seed Store Settings
  console.log("Seeding store settings...");
  await prisma.storeSetting.upsert({
    where: { key: "cod_enabled" },
    update: {},
    create: {
      key: "cod_enabled",
      value: { enabled: false }, // Cash on Delivery disabled by default (FR-35)
      description: "Controls whether Cash on Delivery is allowed at checkout",
    },
  });

  await prisma.storeSetting.upsert({
    where: { key: "otp_max_retries" },
    update: {},
    create: {
      key: "otp_max_retries",
      value: { maxRetries: 3, lockoutHours: 24 }, // FR-42, FR-43
      description: "OTP retry limit and lockout duration",
    },
  });

  await prisma.storeSetting.upsert({
    where: { key: "store_pickup_locations" },
    update: {},
    create: {
      key: "store_pickup_locations",
      value: [
        { id: "colombo", name: "Colombo TransAsia Head Office", address: "Main Street, Colombo 11" },
        { id: "kurunegala", name: "Kurunegala Branch", address: "Kandy Road, Kurunegala" },
      ],
      description: "Confirmed store pickup branches (FR-36)",
    },
  });

  // 2. Seed Admin User
  console.log("Seeding default administrator...");
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const adminUser = await prisma.user.upsert({
    where: { phone: "0771234567" },
    update: {},
    create: {
      phone: "0771234567",
      email: "admin@transasia.lk",
      passwordHash: adminPasswordHash,
      status: "ACTIVE",
      adminUser: {
        create: {
          username: "admin",
          role: "SUPER_ADMIN",
          permissions: { all: true },
        },
      },
    },
  });

  // 3. Seed Sri Lanka Districts and Sample Cities (FR-31, FR-32)
  console.log("Seeding Sri Lanka districts and cities...");
  const districtsData = [
    { name: "Colombo", code: "CMB", cities: [{ name: "Colombo 01 - Fort", postalCode: "00100" }, { name: "Colombo 03 - Kollupitiya", postalCode: "00300" }, { name: "Kochchikade", postalCode: "01300" }] },
    { name: "Gampaha", code: "GMP", cities: [{ name: "Negombo", postalCode: "11500" }, { name: "Kochchikade", postalCode: "11540" }, { name: "Kelaniya", postalCode: "11600" }] },
    { name: "Kurunegala", code: "KRN", cities: [{ name: "Kurunegala City", postalCode: "60000" }, { name: "Kuliyapitiya", postalCode: "60200" }] },
    { name: "Kandy", code: "KDY", cities: [{ name: "Kandy City", postalCode: "20000" }, { name: "Peradeniya", postalCode: "20400" }] },
    { name: "Galle", code: "GLE", cities: [{ name: "Galle Fort", postalCode: "80000" }, { name: "Hikkaduwa", postalCode: "80240" }] },
    { name: "Kalutara", code: "KLT", cities: [{ name: "Panadura", postalCode: "12500" }, { name: "Kalutara South", postalCode: "12000" }] },
  ];

  for (const d of districtsData) {
    const district = await prisma.district.upsert({
      where: { code: d.code },
      update: {},
      create: {
        name: d.name,
        code: d.code,
      },
    });

    for (const c of d.cities) {
      await prisma.city.upsert({
        where: {
          districtId_name: {
            districtId: district.id,
            name: c.name,
          },
        },
        update: {},
        create: {
          name: c.name,
          postalCode: c.postalCode,
          districtId: district.id,
        },
      });
    }
  }

  // 4. Seed Brands
  console.log("Seeding brands...");
  const brandsData = [
    { name: "Sony", slug: "sony", imgSrc: "/assets/images/brands/brand-a-03.webp", discountText: "Upto 15% off" },
    { name: "Samsung", slug: "samsung", imgSrc: "/assets/images/brands/brand-a-07.webp", discountText: "Upto 12% off" },
    { name: "Apple", slug: "apple", imgSrc: "/assets/images/brands/brand-a-01.webp", discountText: "Upto 20% off" },
    { name: "Asus", slug: "asus", imgSrc: "/assets/images/brands/brand-a-04.webp", discountText: "Upto 25% off" },
    { name: "Lenovo", slug: "lenovo", imgSrc: "/assets/images/brands/brand-a-08.webp", discountText: "Upto 16% off" },
  ];

  const createdBrands: Record<string, any> = {};
  for (const b of brandsData) {
    createdBrands[b.slug] = await prisma.brand.upsert({
      where: { slug: b.slug },
      update: {},
      create: b,
    });
  }

  // 5. Seed Categories
  console.log("Seeding categories...");
  const categoriesData = [
    { title: "Smartphones & Mobile", slug: "smartphones", imgSrc: "/assets/images/catagory-img/cat-img-01.webp" },
    { title: "Audio & Headphones", slug: "audio", imgSrc: "/assets/images/catagory-img/cat-img-02.webp" },
    { title: "Laptops & Computers", slug: "laptops", imgSrc: "/assets/images/catagory-img/cat-img-03.webp" },
    { title: "Wearable Tech", slug: "wearables", imgSrc: "/assets/images/catagory-img/cat-img-04.webp" },
    { title: "Cameras & Drones", slug: "cameras", imgSrc: "/assets/images/catagory-img/cat-img-05.webp" },
  ];

  const createdCategories: Record<string, any> = {};
  for (const c of categoriesData) {
    createdCategories[c.slug] = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }

  // 6. Seed Sample Products (Testing Stock Rules FR-27, FR-28)
  console.log("Seeding products with stock rule variations...");
  const sampleProducts = [
    {
      sku: "TA-PHN-001",
      posItemCode: "POS-1001",
      title: "Apple iPhone 15 Pro Max 256GB Natural Titanium",
      slug: "iphone-15-pro-max-256gb",
      description: "A17 Pro chip, aerospace-grade titanium design, 48MP main camera with 5x optical zoom.",
      basePrice: 425000,
      wholesalePrice: 395000,
      stockQuantity: 45, // >= 21: tests "20+ Qty Available" (FR-28)
      brandSlug: "apple",
      categorySlug: "smartphones",
      images: ["/assets/images/product-img/product-img-01.webp"],
    },
    {
      sku: "TA-AUD-002",
      posItemCode: "POS-1002",
      title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
      slug: "sony-wh-1000xm5-headphones",
      description: "Industry-leading noise cancellation, exceptional sound quality with Auto NC Optimizer.",
      basePrice: 115000,
      wholesalePrice: 98000,
      stockQuantity: 14, // <= 20: tests exact stock count (FR-27)
      brandSlug: "sony",
      categorySlug: "audio",
      images: ["/assets/images/product-img/product-img-02.webp"],
    },
    {
      sku: "TA-LPT-003",
      posItemCode: "POS-1003",
      title: "Asus ROG Zephyrus G16 Gaming Laptop",
      slug: "asus-rog-zephyrus-g16",
      description: "Intel Core Ultra 9, RTX 4080 GPU, OLED 240Hz Nebula display for extreme performance.",
      basePrice: 650000,
      wholesalePrice: 590000,
      stockQuantity: 8, // <= 20: tests exact stock count (FR-27)
      brandSlug: "asus",
      categorySlug: "laptops",
      images: ["/assets/images/product-img/product-img-03.webp"],
    },
    {
      sku: "TA-SMC-004",
      posItemCode: "POS-1004",
      title: "Samsung Galaxy S24 Ultra 512GB Titanium Gray",
      slug: "samsung-galaxy-s24-ultra-512gb",
      description: "Galaxy AI features, Snapdragon 8 Gen 3, integrated S Pen, 200MP camera system.",
      basePrice: 399000,
      wholesalePrice: 365000,
      stockQuantity: 28, // >= 21: tests "20+ Qty Available" (FR-28)
      brandSlug: "samsung",
      categorySlug: "smartphones",
      images: ["/assets/images/product-img/product-img-04.webp"],
    },
  ];

  for (const p of sampleProducts) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        posItemCode: p.posItemCode,
        title: p.title,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice,
        wholesalePrice: p.wholesalePrice,
        stockQuantity: p.stockQuantity,
        status: "ACTIVE",
        brandId: createdBrands[p.brandSlug]?.id,
        categoryId: createdCategories[p.categorySlug]?.id,
        images: {
          create: p.images.map((url, i) => ({
            url,
            isPrimary: i === 0,
            sortOrder: i,
          })),
        },
      },
    });
  }

  // 7. Seed Sample Wholesale and Regular Customers
  console.log("Seeding test customer accounts...");
  const regularUser = await prisma.user.upsert({
    where: { phone: "0773392727" },
    update: {},
    create: {
      phone: "0773392727", // The TransAsia Hotline phone number
      email: "customer@example.com",
      status: "ACTIVE",
      customerProfile: {
        create: {
          fullName: "Ashan Gunasekara",
          customerType: "REGULAR",
          approvalStatus: "APPROVED",
        },
      },
    },
  });

  const wholesaleUser = await prisma.user.upsert({
    where: { phone: "0719876543" },
    update: {},
    create: {
      phone: "0719876543",
      email: "wholesale@transasia.lk",
      passwordHash: await bcrypt.hash("wholesale123", 10),
      status: "ACTIVE",
      customerProfile: {
        create: {
          fullName: "Lanka Electronics Traders",
          customerType: "WHOLESALE",
          wholesaleCustomerId: "WS-10025", // POS-assigned ID
          businessName: "Lanka Electronics (Pvt) Ltd",
          businessAddress: "128 First Cross Street, Colombo 11",
          ownerName: "Sunil Perera",
          approvalStatus: "APPROVED", // Approved: receives wholesale prices
        },
      },
    },
  });

  console.log("TransAsia database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
