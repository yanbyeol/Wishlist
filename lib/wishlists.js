import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/mongodb";
import {
  documentIdFilter,
  foreignKeyCandidates,
  foreignKeyFilter,
  normalizeId,
  toObjectId,
} from "@/lib/utils/mongo";
import { getStartedGroupGiftFilter } from "@/lib/utils/group-gift";
import { findUserById } from "@/lib/users";

let wishlistIndexSetupPromise;

function isDuplicateKeyError(error) {
  return Number(error?.code) === 11000;
}

async function ensureWishlistIndexes(db) {
  if (!wishlistIndexSetupPromise) {
    wishlistIndexSetupPromise = Promise.all([
      db.collection("wishlists").createIndex(
        { userId: 1 },
        { name: "wishlists_userId_unique", unique: true },
      ),
      db.collection("wishlistItems").createIndex(
        { wishlistId: 1, productId: 1 },
        { name: "wishlistItems_wishlistId_productId_unique", unique: true },
      ),
    ]).catch((error) => {
      wishlistIndexSetupPromise = null;
      throw error;
    });
  }

  return wishlistIndexSetupPromise;
}

async function getWishlistDatabase() {
  const db = await getDatabase();
  await ensureWishlistIndexes(db);
  return db;
}

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
  const db = await getWishlistDatabase();
  const wishlistCollection = db.collection("wishlists");
  const userFilter = foreignKeyFilter("userId", user.id);
  const existing = await wishlistCollection.findOne(userFilter);

  if (existing) {
    return presentWishlist(existing);
  }

  const now = new Date();
  const normalizedUserId = normalizeId(user.id);
  const wishlist = {
    userId: normalizedUserId,
    title: `${user.name}님의 위시리스트`,
    shareToken: randomUUID().replaceAll("-", ""),
    visibility: "public",
    createdAt: now,
    updatedAt: now,
  };

  try {
    const savedWishlist = await wishlistCollection.findOneAndUpdate(
      { userId: normalizedUserId },
      { $setOnInsert: wishlist },
      { upsert: true, returnDocument: "after" },
    );
    return presentWishlist(savedWishlist);
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const concurrentlyCreated = await wishlistCollection.findOne(userFilter);
    if (!concurrentlyCreated) {
      throw error;
    }
    return presentWishlist(concurrentlyCreated);
  }
}

async function loadWishlistItems(wishlistId) {
  const db = await getWishlistDatabase();
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
  const db = await getWishlistDatabase();
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
  const db = await getWishlistDatabase();
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

export async function isProductInWishlist(userId, productId) {
  const db = await getWishlistDatabase();
  const wishlist = await db
    .collection("wishlists")
    .findOne(foreignKeyFilter("userId", userId));

  if (!wishlist) {
    return false;
  }

  const item = await db.collection("wishlistItems").findOne({
    wishlistId: { $in: foreignKeyCandidates([normalizeId(wishlist._id)]) },
    productId: { $in: foreignKeyCandidates([productId]) },
  });
  return Boolean(item);
}

export async function setWishlistProduct(user, productId, shouldAdd) {
  const db = await getWishlistDatabase();
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

  if (shouldAdd) {
    if (existing) {
      return { added: true, alreadyExists: true, removalBlocked: false };
    }

    const now = new Date();
    try {
      const result = await db.collection("wishlistItems").updateOne(
        {
          wishlistId: wishlist.id,
          productId: normalizeId(productId),
        },
        {
          $setOnInsert: {
            wishlistId: wishlist.id,
            productId: normalizeId(productId),
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
      return {
        added: true,
        alreadyExists: result.upsertedCount === 0,
        removalBlocked: false,
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return { added: true, alreadyExists: true, removalBlocked: false };
      }
      throw error;
    }
  }

  if (existing) {
    const startedGroupGift = await db.collection("groupGifts").findOne({
      ...foreignKeyFilter("recipientId", user.id),
      ...foreignKeyFilter("productId", productId),
      ...getStartedGroupGiftFilter(),
    });

    if (startedGroupGift) {
      return { added: false, removalBlocked: true };
    }

    await db.collection("wishlistItems").deleteMany(itemFilter);
    return { added: false, removalBlocked: false };
  }

  return { added: false, removalBlocked: false };
}

export async function removeProductFromRecipientWishlist(recipientId, productId) {
  const db = await getWishlistDatabase();
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
