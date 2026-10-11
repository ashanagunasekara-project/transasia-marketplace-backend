import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CategoryDefinition {
  title: string;
  imgSrc: string;
  subcategories: string[];
}

const documentationCategories: CategoryDefinition[] = [
  {
    title: "Mobile Accessories",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-1.webp",
    subcategories: [
      "Chargers",
      "Data Cables",
      "Back Covers & Pouches",
      "Tempered Glasses",
      "Phone Holder",
      "Aux Cable",
      "SIM Adapter & Trays",
      "Selfie Stick",
      "Cases & Covers",
      "Selfie Light",
      "Tripods",
      "Micro Accessories",
      "USB Charger",
      "Wireless Charger",
      "OTG",
      "Microphone",
      "Car Charger",
    ],
  },
  {
    title: "Mobile Spare Parts",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-2.webp",
    subcategories: [
      "Battery",
      "Mobile Display Full Set",
      "Flex",
      "IC",
      "Display Touch",
      "Mobile Display",
      "Mic",
      "Charging Connector",
      "Other Connectors",
      "Phone Housing",
      "Battery & LCD Stickers",
      "Earpeice",
    ],
  },
  {
    title: "Mobile Repair ToolKits",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-3.webp",
    subcategories: [
      "Microscope",
      "Screwdrivers & Scrapers",
      "Soldering Paste & Flux",
      "Tools",
      "Tweezers",
      "Glue",
      "Hot Gun",
      "Solder Bit",
      "LCD Leminating Machine",
      "Power Supply",
      "Multi Meter",
      "Soldering Station",
      "Software Box",
      "Soldering Iron",
      "LCD Machine",
      "Lamp",
      "Solder Wire",
      "UV Lamp",
      "Spot Welding",
      "Thermal Camera",
      "Laser Engraving Machine",
    ],
  },
  {
    title: "Computer Accessories",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-4.webp",
    subcategories: [
      "USB Hub",
      "VGA Cable",
      "USB Cable",
      "HDMI Cable",
      "Mouse",
      "Keyboards",
      "Speakers",
      "Web Camera",
      "Card Reader",
      "Power Adaptor",
      "Bluetooth Adapter",
      "USB Power Cable",
      "WiFi Adaptor",
      "Power Cable",
      "4G Dongle",
      "Mouse Pad",
      "WiFi Router",
      "Office Equipment",
    ],
  },
  {
    title: "Home & Garden",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-5.webp",
    subcategories: [
      "Home Appliances",
      "Tablets",
      "Air Cooler",
      "Telephones & System",
      "Hair & Body",
      "TV Mount",
      "Hair Dryer",
      "Juice Blender",
      "Bicycle - Petal",
    ],
  },
  {
    title: "Other Electronics",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-6.webp",
    subcategories: [
      "Rechargeable Fan",
      "Microphone",
      "Fan",
      "TV",
      "Radio",
      "Chromecast",
      "Power Cord",
      "Other Cables & Clips",
      "Headlamp",
      "Rechargeable & Flashlights",
      "Solar Lamp",
      "Projectors & similar devices",
      "Remote Battery",
      "TV Box",
      "Power Adapter",
    ],
  },
  {
    title: "LED",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-7.webp",
    subcategories: [
      "LED USB Fan",
      "LED Party Light",
      "House Bulb",
      "Emergency Light",
      "LED Light",
      "LED Panels",
    ],
  },
  {
    title: "Head Phones & Earphones",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-8.webp",
    subcategories: [
      "Bluetooth Earbuds",
      "Earphones",
      "Headphones",
    ],
  },
  {
    title: "Storage Devices",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-9.webp",
    subcategories: [
      "USB Flash Drive",
      "Memory Card",
      "Hard Disk",
      "Voice Recorder",
    ],
  },
  {
    title: "CCTV & Security",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-10.webp",
    subcategories: [
      "Camera",
      "Bulb Camera",
      "Out Door Camera",
      "Indoor Camera",
      "Jacks & Interfaces",
      "Camera Bracket",
    ],
  },
  {
    title: "Smart Devices",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-11.webp",
    subcategories: [
      "Smart Watch",
      "Smart Watch Battery",
    ],
  },
  {
    title: "Mobile Phones",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-12.webp",
    subcategories: [
      "Used Phones or Boxes",
      "Brand New Phones",
    ],
  },
  {
    title: "Stationeries",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-1.webp",
    subcategories: [
      "Office Equipment",
      "Calculator",
    ],
  },
  {
    title: "Other Accessories",
    imgSrc: "/assets/images/catagory-img/categories-list-card/category-list-image-2.webp",
    subcategories: [
      "Auto Parts",
      "Car Video",
    ],
  },
];

async function seedCategories() {
  console.log("Seeding categories and subcategories from categories-list.md...");

  let parentCount = 0;
  let subCount = 0;

  for (let i = 0; i < documentationCategories.length; i++) {
    const catDef = documentationCategories[i];
    const parentSlug = generateSlug(catDef.title);

    // Upsert parent category
    let parent = await prisma.category.findUnique({ where: { slug: parentSlug } });
    if (!parent) {
      parent = await prisma.category.create({
        data: {
          title: catDef.title,
          slug: parentSlug,
          imgSrc: catDef.imgSrc,
          sortOrder: i + 1,
          isWider: i === 0,
        },
      });
    } else {
      parent = await prisma.category.update({
        where: { id: parent.id },
        data: {
          title: catDef.title,
          imgSrc: catDef.imgSrc,
          sortOrder: i + 1,
        },
      });
    }
    parentCount++;

    // Upsert subcategories
    for (let j = 0; j < catDef.subcategories.length; j++) {
      const subTitle = catDef.subcategories[j];
      const subSlug = `${parentSlug}-${generateSlug(subTitle)}`;

      let sub = await prisma.category.findUnique({ where: { slug: subSlug } });
      if (!sub) {
        sub = await prisma.category.create({
          data: {
            title: subTitle,
            slug: subSlug,
            parentId: parent.id,
            sortOrder: j + 1,
          },
        });
      } else {
        sub = await prisma.category.update({
          where: { id: sub.id },
          data: {
            title: subTitle,
            parentId: parent.id,
            sortOrder: j + 1,
          },
        });
      }
      subCount++;
    }
  }

  console.log(`Successfully seeded ${parentCount} parent categories and ${subCount} subcategories!`);
}

seedCategories()
  .catch((e) => {
    console.error("Failed to seed categories:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
