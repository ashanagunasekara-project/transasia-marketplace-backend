import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import {
  AuthenticatedRequest,
  optionalAuthenticateToken,
  authenticateToken,
} from "../middlewares/auth.middleware";

const router = Router();

// Helper: Determine if customer is approved wholesale
async function checkWholesaleApproval(
  userId?: string,
  viewMode?: string
): Promise<boolean> {
  if (!userId) return false;
  if (viewMode === "REGULAR") return false;

  const profile = await prisma.customerProfile.findUnique({
    where: { userId },
  });

  return (
    profile?.customerType === "WHOLESALE" &&
    profile?.approvalStatus === "APPROVED"
  );
}

// Helper: Find or create cart for user or session
async function getOrCreateCart(
  userId?: string,
  sessionId?: string
): Promise<{ id: string; userId: string | null; sessionId: string | null }> {
  if (userId) {
    let cart = await prisma.cart.findUnique({
      where: { userId },
    });
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
      });
    }
    return cart;
  }

  const effectiveSessionId = sessionId || randomUUID();
  let cart = await prisma.cart.findUnique({
    where: { sessionId: effectiveSessionId },
  });
  if (!cart) {
    cart = await prisma.cart.create({
      data: { sessionId: effectiveSessionId },
    });
  }
  return cart;
}

// Helper: Format cart items with dynamic pricing & stock flags
async function formatCartResponse(
  cartId: string,
  userId?: string,
  viewMode?: string
) {
  const isWholesale = await checkWholesaleApproval(userId, viewMode);

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: "asc" } },
              category: true,
              brand: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!cart) {
    return null;
  }

  let subtotal = 0;
  let totalItems = 0;
  let hasStockIssues = false;

  const formattedItems = cart.items.map((item) => {
    const product = item.product;
    const isWholesaleApplied = isWholesale && product.wholesalePrice !== null;
    const unitPrice = isWholesaleApplied
      ? Number(product.wholesalePrice)
      : Number(product.basePrice);

    const itemTotalPrice = unitPrice * item.quantity;
    subtotal += itemTotalPrice;
    totalItems += item.quantity;

    const isAvailable =
      product.status === "ACTIVE" && product.stockQuantity > 0;
    const isExceedingStock = item.quantity > product.stockQuantity;

    if (!isAvailable || isExceedingStock) {
      hasStockIssues = true;
    }

    const primaryImage =
      product.images.find((img) => img.isPrimary)?.url ||
      product.images[0]?.url ||
      null;

    return {
      id: item.id,
      cartId: item.cartId,
      productId: product.id,
      quantity: item.quantity,
      unitPrice,
      totalPrice: itemTotalPrice,
      isWholesaleApplied,
      product: {
        id: product.id,
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        basePrice: Number(product.basePrice),
        wholesalePrice: product.wholesalePrice
          ? Number(product.wholesalePrice)
          : null,
        stockQuantity: product.stockQuantity,
        status: product.status,
        isAvailable,
        isExceedingStock,
        primaryImage,
        category: product.category
          ? { id: product.category.id, title: product.category.title, slug: product.category.slug }
          : null,
        brand: product.brand
          ? { id: product.brand.id, name: product.brand.name, slug: product.brand.slug }
          : null,
      },
    };
  });

  return {
    id: cart.id,
    userId: cart.userId,
    sessionId: cart.sessionId,
    items: formattedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    totalItems,
    hasStockIssues,
    isWholesaleCustomer: isWholesale,
    updatedAt: cart.updatedAt,
  };
}

// -------------------------------------------------------------------
// 1. GET /api/cart: Retrieve active cart (Guest or Authenticated)
// -------------------------------------------------------------------
router.get(
  "/",
  optionalAuthenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const sessionId =
        (req.headers["x-session-id"] as string) ||
        (req.query.sessionId as string);
      const viewMode = (req.headers["x-customer-view"] as string) || undefined;

      // If neither user nor session is provided, return empty template with new session ID
      if (!userId && !sessionId) {
        const newSessionId = randomUUID();
        return res.json({
          success: true,
          data: {
            id: null,
            userId: null,
            sessionId: newSessionId,
            items: [],
            subtotal: 0,
            totalItems: 0,
            hasStockIssues: false,
            isWholesaleCustomer: false,
            updatedAt: new Date(),
          },
        });
      }

      const cart = await getOrCreateCart(userId, sessionId);
      const formatted = await formatCartResponse(cart.id, userId, viewMode);

      res.json({
        success: true,
        data: formatted,
      });
    } catch (error: any) {
      console.error("GET /api/cart error:", error);
      res.status(500).json({ success: false, message: "Failed to retrieve shopping cart" });
    }
  }
);

// -------------------------------------------------------------------
// 2. POST /api/cart/items: Add item to cart or increment quantity
// -------------------------------------------------------------------
router.post(
  "/items",
  optionalAuthenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const sessionId =
        (req.headers["x-session-id"] as string) || req.body.sessionId;
      const viewMode = (req.headers["x-customer-view"] as string) || undefined;

      const { productId, quantity = 1 } = req.body;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const parsedQty = Math.max(1, parseInt(quantity, 10) || 1);

      // Verify product existence and stock
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });
      }

      if (product.status === "OUT_OF_STOCK" || product.stockQuantity <= 0) {
        return res.status(400).json({
          success: false,
          message: `"${product.title}" is currently out of stock`,
        });
      }

      const cart = await getOrCreateCart(userId, sessionId);

      // Check existing item in cart
      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId,
          },
        },
      });

      const currentQtyInCart = existingItem?.quantity || 0;
      const targetQty = currentQtyInCart + parsedQty;

      // Enforce FR-29: Max 20 units per item
      if (targetQty > 20) {
        return res.status(400).json({
          success: false,
          message: `Maximum quantity exceeded for "${product.title}". You can purchase a maximum of 20 units of one item (FR-29).`,
        });
      }

      // Check inventory limit
      if (targetQty > product.stockQuantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stockQuantity} units available for "${product.title}".`,
        });
      }

      if (existingItem) {
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: targetQty },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            quantity: targetQty,
          },
        });
      }

      // Update cart timestamp
      await prisma.cart.update({
        where: { id: cart.id },
        data: { updatedAt: new Date() },
      });

      const formatted = await formatCartResponse(cart.id, userId, viewMode);

      res.status(201).json({
        success: true,
        message: `Added "${product.title}" to cart`,
        data: formatted,
      });
    } catch (error: any) {
      console.error("POST /api/cart/items error:", error);
      res.status(500).json({ success: false, message: "Failed to add item to cart" });
    }
  }
);

// -------------------------------------------------------------------
// 3. PATCH /api/cart/items/:itemId: Update item quantity
// -------------------------------------------------------------------
router.patch(
  "/items/:itemId",
  optionalAuthenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const sessionId =
        (req.headers["x-session-id"] as string) || req.body.sessionId;
      const viewMode = (req.headers["x-customer-view"] as string) || undefined;
      const { itemId } = req.params;
      const { quantity } = req.body;

      const targetQty = parseInt(quantity, 10);
      if (isNaN(targetQty) || targetQty < 1) {
        return res
          .status(400)
          .json({ success: false, message: "Quantity must be at least 1" });
      }

      if (targetQty > 20) {
        return res.status(400).json({
          success: false,
          message: "You can purchase a maximum of 20 units of one item (FR-29).",
        });
      }

      const cartItem = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: { product: true, cart: true },
      });

      if (!cartItem) {
        return res
          .status(404)
          .json({ success: false, message: "Cart item not found" });
      }

      // Authorization check: ensure user owns this cart
      if (userId && cartItem.cart.userId !== userId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      if (!userId && sessionId && cartItem.cart.sessionId !== sessionId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      // Inventory check
      if (targetQty > cartItem.product.stockQuantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${cartItem.product.stockQuantity} units available for "${cartItem.product.title}".`,
        });
      }

      await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: targetQty },
      });

      await prisma.cart.update({
        where: { id: cartItem.cartId },
        data: { updatedAt: new Date() },
      });

      const formatted = await formatCartResponse(
        cartItem.cartId,
        userId,
        viewMode
      );

      res.json({
        success: true,
        message: "Cart updated successfully",
        data: formatted,
      });
    } catch (error: any) {
      console.error("PATCH /api/cart/items error:", error);
      res.status(500).json({ success: false, message: "Failed to update cart item" });
    }
  }
);

// -------------------------------------------------------------------
// 4. DELETE /api/cart/items/:itemId: Remove item from cart
// -------------------------------------------------------------------
router.delete(
  "/items/:itemId",
  optionalAuthenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const sessionId =
        (req.headers["x-session-id"] as string) ||
        (req.query.sessionId as string);
      const viewMode = (req.headers["x-customer-view"] as string) || undefined;
      const { itemId } = req.params;

      const cartItem = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: { cart: true },
      });

      if (!cartItem) {
        return res
          .status(404)
          .json({ success: false, message: "Cart item not found" });
      }

      // Check ownership
      if (userId && cartItem.cart.userId !== userId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      if (!userId && sessionId && cartItem.cart.sessionId !== sessionId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      await prisma.cartItem.delete({
        where: { id: itemId },
      });

      await prisma.cart.update({
        where: { id: cartItem.cartId },
        data: { updatedAt: new Date() },
      });

      const formatted = await formatCartResponse(
        cartItem.cartId,
        userId,
        viewMode
      );

      res.json({
        success: true,
        message: "Item removed from cart",
        data: formatted,
      });
    } catch (error: any) {
      console.error("DELETE /api/cart/items error:", error);
      res.status(500).json({ success: false, message: "Failed to remove item from cart" });
    }
  }
);

// -------------------------------------------------------------------
// 5. DELETE /api/cart: Empty entire cart
// -------------------------------------------------------------------
router.delete(
  "/",
  optionalAuthenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const sessionId =
        (req.headers["x-session-id"] as string) ||
        (req.query.sessionId as string);
      const viewMode = (req.headers["x-customer-view"] as string) || undefined;

      const cart = userId
        ? await prisma.cart.findUnique({ where: { userId } })
        : sessionId
        ? await prisma.cart.findUnique({ where: { sessionId } })
        : null;

      if (cart) {
        await prisma.cartItem.deleteMany({
          where: { cartId: cart.id },
        });

        await prisma.cart.update({
          where: { id: cart.id },
          data: { updatedAt: new Date() },
        });

        const formatted = await formatCartResponse(cart.id, userId, viewMode);
        return res.json({
          success: true,
          message: "Cart cleared",
          data: formatted,
        });
      }

      res.json({
        success: true,
        message: "Cart is already empty",
        data: {
          id: null,
          items: [],
          subtotal: 0,
          totalItems: 0,
        },
      });
    } catch (error: any) {
      console.error("DELETE /api/cart error:", error);
      res.status(500).json({ success: false, message: "Failed to clear cart" });
    }
  }
);

// -------------------------------------------------------------------
// 6. POST /api/cart/merge: Merge guest items into customer cart on login
// -------------------------------------------------------------------
router.post(
  "/merge",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { guestSessionId, guestItems } = req.body;
      const viewMode = (req.headers["x-customer-view"] as string) || undefined;

      // Find or create customer's persistent cart
      const userCart = await getOrCreateCart(userId);

      // Collect items to merge: from database guest cart OR payload array
      const itemsToMerge: Array<{ productId: string; quantity: number }> = [];

      if (guestSessionId) {
        const guestCart = await prisma.cart.findUnique({
          where: { sessionId: guestSessionId },
          include: { items: true },
        });

        if (guestCart && guestCart.items.length > 0) {
          guestCart.items.forEach((item) => {
            itemsToMerge.push({
              productId: item.productId,
              quantity: item.quantity,
            });
          });

          // Delete guest cart once merged
          await prisma.cart.delete({ where: { id: guestCart.id } });
        }
      }

      // Also merge any items passed directly from frontend localStorage
      if (Array.isArray(guestItems) && guestItems.length > 0) {
        guestItems.forEach((item) => {
          if (item.productId && item.quantity > 0) {
            const existing = itemsToMerge.find(
              (m) => m.productId === item.productId
            );
            if (existing) {
              existing.quantity = Math.max(existing.quantity, item.quantity);
            } else {
              itemsToMerge.push({
                productId: item.productId,
                quantity: item.quantity,
              });
            }
          }
        });
      }

      // Upsert each item into userCart
      for (const item of itemsToMerge) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
        });

        if (!product || product.status === "OUT_OF_STOCK" || product.stockQuantity <= 0) {
          continue; // Skip out of stock items during merge
        }

        const existingItem = await prisma.cartItem.findUnique({
          where: {
            cartId_productId: {
              cartId: userCart.id,
              productId: item.productId,
            },
          },
        });

        const targetQty = Math.min(
          20,
          Math.min(
            (existingItem?.quantity || 0) + item.quantity,
            product.stockQuantity
          )
        );

        if (existingItem) {
          await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: targetQty },
          });
        } else {
          await prisma.cartItem.create({
            data: {
              cartId: userCart.id,
              productId: item.productId,
              quantity: targetQty,
            },
          });
        }
      }

      await prisma.cart.update({
        where: { id: userCart.id },
        data: { updatedAt: new Date() },
      });

      const formatted = await formatCartResponse(userCart.id, userId, viewMode);

      res.json({
        success: true,
        message: "Cart synchronized successfully",
        data: formatted,
      });
    } catch (error: any) {
      console.error("POST /api/cart/merge error:", error);
      res.status(500).json({ success: false, message: "Failed to merge cart" });
    }
  }
);

// -------------------------------------------------------------------
// 7. POST /api/cart/validate: Pre-checkout inventory & price validation
// -------------------------------------------------------------------
router.post(
  "/validate",
  optionalAuthenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const sessionId =
        (req.headers["x-session-id"] as string) || req.body.sessionId;
      const viewMode = (req.headers["x-customer-view"] as string) || undefined;

      const cart = userId
        ? await prisma.cart.findUnique({ where: { userId } })
        : sessionId
        ? await prisma.cart.findUnique({ where: { sessionId } })
        : null;

      if (!cart) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: "Shopping cart is empty",
        });
      }

      const formatted = await formatCartResponse(cart.id, userId, viewMode);

      if (!formatted || formatted.items.length === 0) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: "Shopping cart is empty",
        });
      }

      const issues: Array<{
        productId: string;
        title: string;
        issue: string;
        type: "OUT_OF_STOCK" | "EXCEEDS_STOCK" | "MAX_CAP_EXCEEDED";
      }> = [];

      formatted.items.forEach((item) => {
        if (!item.product.isAvailable) {
          issues.push({
            productId: item.productId,
            title: item.product.title,
            issue: `"${item.product.title}" is currently out of stock`,
            type: "OUT_OF_STOCK",
          });
        } else if (item.quantity > item.product.stockQuantity) {
          issues.push({
            productId: item.productId,
            title: item.product.title,
            issue: `Only ${item.product.stockQuantity} units available for "${item.product.title}" (you have ${item.quantity} in cart)`,
            type: "EXCEEDS_STOCK",
          });
        } else if (item.quantity > 20) {
          issues.push({
            productId: item.productId,
            title: item.product.title,
            issue: `Maximum 20 units allowed per item (FR-29)`,
            type: "MAX_CAP_EXCEEDED",
          });
        }
      });

      res.json({
        success: true,
        valid: issues.length === 0,
        issues,
        cart: formatted,
      });
    } catch (error: any) {
      console.error("POST /api/cart/validate error:", error);
      res.status(500).json({ success: false, message: "Failed to validate cart" });
    }
  }
);

export default router;
