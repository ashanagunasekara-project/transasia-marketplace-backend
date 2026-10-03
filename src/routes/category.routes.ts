import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// Helper to generate URL-safe slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ----------------------------------------------------
// 1. List all categories
// ----------------------------------------------------
router.get("/", async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        children: true,
        _count: { select: { products: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    res.json({
      success: true,
      data: categories.map((cat) => ({
        id: cat.id,
        title: cat.title,
        name: cat.title, // alias for admin tables
        slug: cat.slug,
        imgSrc: cat.imgSrc,
        image: cat.imgSrc || "/assets/images/catagory-img/cat-bg-headphones-01.webp", // alias for admin tables
        description: cat.description,
        isWider: cat.isWider,
        parentId: cat.parentId,
        subCategories: cat.children,
        productCount: cat._count.products,
        count: cat._count.products, // alias for admin tables
        status: "published", // default for admin display
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch categories" });
  }
});

// ----------------------------------------------------
// 2. Get single category by ID or Slug
// ----------------------------------------------------
router.get("/:identifier", async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;

    const category = await prisma.category.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        children: true,
        parent: true,
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({
      success: true,
      data: {
        id: category.id,
        title: category.title,
        name: category.title,
        slug: category.slug,
        imgSrc: category.imgSrc,
        image: category.imgSrc || "/assets/images/catagory-img/cat-bg-headphones-01.webp",
        description: category.description,
        isWider: category.isWider,
        parentId: category.parentId,
        parent: category.parent,
        subCategories: category.children,
        productCount: category._count.products,
        count: category._count.products,
        status: "published",
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch category" });
  }
});

// ----------------------------------------------------
// 3. Create a new category
// ----------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  try {
    const { title, name, slug: inputSlug, imgSrc, image, description, parentId, sortOrder, isWider } = req.body;

    const categoryTitle = title || name;
    if (!categoryTitle) {
      return res.status(400).json({ success: false, message: "Category name/title is required" });
    }

    let slug = inputSlug ? generateSlug(inputSlug) : generateSlug(categoryTitle);

    // Ensure slug uniqueness
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const newCategory = await prisma.category.create({
      data: {
        title: categoryTitle,
        slug,
        imgSrc: imgSrc || image || null,
        description: description || null,
        parentId: parentId || null,
        sortOrder: sortOrder !== undefined ? parseInt(String(sortOrder), 10) : 0,
        isWider: Boolean(isWider),
      },
      include: {
        children: true,
        _count: { select: { products: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: {
        id: newCategory.id,
        title: newCategory.title,
        name: newCategory.title,
        slug: newCategory.slug,
        imgSrc: newCategory.imgSrc,
        image: newCategory.imgSrc || "/assets/images/catagory-img/cat-bg-headphones-01.webp",
        description: newCategory.description,
        isWider: newCategory.isWider,
        parentId: newCategory.parentId,
        productCount: 0,
        count: 0,
        status: "published",
        createdAt: newCategory.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Create category error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create category" });
  }
});

// ----------------------------------------------------
// 4. Update an existing category
// ----------------------------------------------------
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, name, slug: inputSlug, imgSrc, image, description, parentId, sortOrder, isWider } = req.body;

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const updateData: any = {};
    if (title || name) updateData.title = title || name;
    if (inputSlug) {
      const slug = generateSlug(inputSlug);
      // Check if another category has this slug
      const conflict = await prisma.category.findFirst({
        where: { slug, id: { not: id } },
      });
      if (!conflict) {
        updateData.slug = slug;
      }
    }
    if (imgSrc !== undefined || image !== undefined) {
      updateData.imgSrc = imgSrc !== undefined ? imgSrc : image;
    }
    if (description !== undefined) updateData.description = description;
    if (parentId !== undefined) updateData.parentId = parentId || null;
    if (sortOrder !== undefined) updateData.sortOrder = parseInt(String(sortOrder), 10);
    if (isWider !== undefined) updateData.isWider = Boolean(isWider);

    const updated = await prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        children: true,
        _count: { select: { products: true } },
      },
    });

    res.json({
      success: true,
      message: "Category updated successfully",
      data: {
        id: updated.id,
        title: updated.title,
        name: updated.title,
        slug: updated.slug,
        imgSrc: updated.imgSrc,
        image: updated.imgSrc || "/assets/images/catagory-img/cat-bg-headphones-01.webp",
        description: updated.description,
        isWider: updated.isWider,
        parentId: updated.parentId,
        productCount: updated._count.products,
        count: updated._count.products,
        status: "published",
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Update category error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update category" });
  }
});

// ----------------------------------------------------
// 5. Delete category
// ----------------------------------------------------
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id },
      include: { children: true },
    });

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // Unlink parent from subcategories if any
    if (category.children.length > 0) {
      await prisma.category.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      });
    }

    // Unlink products from this category
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    await prisma.category.delete({
      where: { id },
    });

    res.json({ success: true, message: "Category deleted successfully" });
  } catch (error: any) {
    console.error("Delete category error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to delete category" });
  }
});

export default router;
