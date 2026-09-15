import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/mongodb";
import {
  documentIdFilter,
  foreignKeyCandidates,
  foreignKeyFilter,
  normalizeId,
  toObjectId,
} from "@/lib/utils/mongo";
import { findUserById } from "@/lib/users";

function presentWishlist(wishlist) {
  if (!wishlist) {
    return null;
  }

  return {
    id: normalizeId(wishlist._id),
    userId: normalizeId(wishlist.userId),
    title: wishlist.title,
    shareToken: wishlist.shareToken,
    visibility: wishlist.visibility,
  };
}

function presentProduct(product) {
  return {
    id: normalizeId(product._id),
    sellerId: normalizeId(product.sellerId),
    name: product.name,
    price: product.price,
    category: product.category ?? "기타",
    quantity: product.quantity,
    description: product.description,
    imageUrl: product.imageUrl ?? product.images?.[0] ?? "",
    status: product.status,
  };
}

export async function ensureWishlist(user) {
  const db = await getDatabase();
  const existing = await db
    .collection("wishlists")
    .findOne(foreignKeyFilter("userId", user.id));

  if (existing) {
    return presentWishlist(existing);
  }

  const now = new Date();
  const wishlist = {
    userId: normalizeId(user.id),
    title: `${user.name}님의 위시리스트`,
    shareToken: randomUUID().replaceAll("-", ""),
    visibility: "public",
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("wishlists").insertOne(wishlist);
  return presentWishlist({ ...wishlist, _id: result.insertedId });
}

async function loadWishlistItems(wishlistId) {
  const db = await getDatabase();
  const items = await db
    .collection("wishlistItems")
    .find(foreignKeyFilter("wishlistId", wishlistId))
    .sort({ createdAt: -1 })
    .toArray();
  const productObjectIds = items
    .map((item) => toObjectId(item.productId))
    .filter(Boolean);
  const products = productObjectIds.length
    ? await db
        .collection("products")
        .find({ _id: { $in: productObjectIds }, status: { $ne: "archived" } })
        .toArray()
    : [];
  const productById = new Map(
    products.map((product) => [normalizeId(product._id), presentProduct(product)]),
  );

  return items
    .map((item) => ({
      id: normalizeId(item._id),
      product: productById.get(normalizeId(item.productId)),
    }))
    .filter((item) => item.product);
}

export async function getWishlistForUser(user) {
  const wishlist = await ensureWishlist(user);
  const items = await loadWishlistItems(wishlist.id);
  return { ...wishlist, items };
}

export async function getSharedWishlist(shareToken) {
  const db = await getDatabase();
  const wishlistDocument = await db.collection("wishlists").findOne({
    shareToken,
    visibility: "public",
  });

  if (!wishlistDocument) {
    return null;
  }

  const wishlist = presentWishlist(wishlistDocument);
  const [owner, items] = await Promise.all([
    findUserById(wishlist.userId),
    loadWishlistItems(wishlist.id),
  ]);

  return { ...wishlist, owner, items };
}

export async function getWishlistedProductIds(userId) {
  const db = await getDatabase();
  const wishlist = await db
    .collection("wishlists")
    .findOne(foreignKeyFilter("userId", userId));

  if (!wishlist) {
    return [];
  }

  const items = await db
    .collection("wishlistItems")
    .find(foreignKeyFilter("wishlistId", normalizeId(wishlist._id)))
    .toArray();
  return items.map((item) => normalizeId(item.productId));
}

export async function toggleWishlistProduct(user, productId) {
  const db = await getDatabase();
  const wishlist = await ensureWishlist(user);
  const product = await db.collection("products").findOne({
    ...documentIdFilter(productId),
    status: { $ne: "archived" },
  });

  if (!product) {
    throw new Error("상품을 찾을 수 없습니다.");
  }

  const itemFilter = {
    wishlistId: { $in: foreignKeyCandidates([wishlist.id]) },
    productId: { $in: foreignKeyCandidates([productId]) },
  };
  const existing = await db.collection("wishlistItems").findOne(itemFilter);

  if (existing) {
    await db.collection("wishlistItems").deleteOne({ _id: existing._id });
    return false;
  }

  await db.collection("wishlistItems").insertOne({
    wishlistId: wishlist.id,
    productId: normalizeId(productId),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return true;
}

export async function removeProductFromRecipientWishlist(recipientId, productId) {
  const db = await getDatabase();
  const wishlist = await db
    .collection("wishlists")
    .findOne(foreignKeyFilter("userId", recipientId));

  if (!wishlist) {
    return;
  }

  await db.collection("wishlistItems").deleteMany({
    wishlistId: { $in: foreignKeyCandidates([normalizeId(wishlist._id)]) },
    productId: { $in: foreignKeyCandidates([productId]) },
  });
}
