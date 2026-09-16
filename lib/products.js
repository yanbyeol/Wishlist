import { getDatabase } from "@/lib/mongodb";
import {
  documentIdFilter,
  foreignKeyFilter,
  normalizeId,
} from "@/lib/utils/mongo";

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function presentProduct(product) {
  if (!product) {
    return null;
  }

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
    createdAt: product.createdAt?.toISOString?.() ?? product.createdAt,
    updatedAt: product.updatedAt?.toISOString?.() ?? product.updatedAt,
  };
}

export async function listProducts({
  category = "",
  query = "",
  sort = "newest",
  excludeSoldOut = false,
} = {}) {
  const db = await getDatabase();
  const filter = excludeSoldOut
    ? { status: "active", quantity: { $gt: 0 } }
    : { status: { $in: ["active", "sold_out"] } };

  if (category) {
    filter.category = category;
  }

  if (query) {
    const expression = new RegExp(escapeRegularExpression(query), "i");
    filter.$or = [{ name: expression }, { description: expression }];
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    price_asc: { price: 1, createdAt: -1 },
    price_desc: { price: -1, createdAt: -1 },
  };
  const products = await db
    .collection("products")
    .find(filter)
    .sort(sortOptions[sort] ?? sortOptions.newest)
    .toArray();

  if (sort === "popular" && products.length > 0) {
    const wishlistCounts = await db
      .collection("wishlistItems")
      .aggregate([
        {
          $group: {
            _id: { $toString: "$productId" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
    const countByProductId = new Map(
      wishlistCounts.map((item) => [item._id, item.count]),
    );

    products.sort((first, second) => {
      const popularityDifference =
        (countByProductId.get(normalizeId(second._id)) ?? 0) -
        (countByProductId.get(normalizeId(first._id)) ?? 0);

      if (popularityDifference !== 0) {
        return popularityDifference;
      }

      return new Date(second.createdAt ?? 0) - new Date(first.createdAt ?? 0);
    });
  }

  return products.map(presentProduct);
}

export async function getProductById(productId) {
  const db = await getDatabase();
  const product = await db.collection("products").findOne(documentIdFilter(productId));
  return presentProduct(product);
}

export async function listProductsBySeller(sellerId) {
  const db = await getDatabase();
  const products = await db
    .collection("products")
    .find(foreignKeyFilter("sellerId", sellerId))
    .sort({ createdAt: -1 })
    .toArray();

  return products.map(presentProduct);
}

export async function createProduct(fields) {
  const db = await getDatabase();
  const now = new Date();
  const product = {
    sellerId: normalizeId(fields.sellerId),
    name: fields.name,
    price: fields.price,
    category: fields.category,
    quantity: fields.quantity,
    description: fields.description,
    imageUrl: fields.imageUrl,
    status: fields.quantity > 0 ? "active" : "sold_out",
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("products").insertOne(product);
  return presentProduct({ ...product, _id: result.insertedId });
}

export async function updateProductOwned(productId, sellerId, fields) {
  const db = await getDatabase();
  const result = await db.collection("products").findOneAndUpdate(
    {
      ...documentIdFilter(productId),
      ...foreignKeyFilter("sellerId", sellerId),
      status: { $ne: "archived" },
    },
    {
      $set: {
        name: fields.name,
        price: fields.price,
        category: fields.category,
        quantity: fields.quantity,
        description: fields.description,
        imageUrl: fields.imageUrl,
        status: fields.quantity > 0 ? "active" : "sold_out",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );

  return presentProduct(result);
}

export async function deleteProductOwned(productId, sellerId) {
  const db = await getDatabase();
  const ownershipFilter = {
    ...documentIdFilter(productId),
    ...foreignKeyFilter("sellerId", sellerId),
  };
  const product = await db.collection("products").findOne(ownershipFilter);

  if (!product) {
    return { deleted: false, archived: false };
  }

  const normalizedProductId = normalizeId(product._id);
  const hasHistory = Boolean(
    (await db.collection("orders").findOne(foreignKeyFilter("productId", normalizedProductId))) ||
      (await db
        .collection("groupGifts")
        .findOne(foreignKeyFilter("productId", normalizedProductId))),
  );

  if (hasHistory) {
    await db.collection("products").updateOne(ownershipFilter, {
      $set: { status: "archived", updatedAt: new Date() },
    });
    return { deleted: true, archived: true };
  }

  await db.collection("products").deleteOne(ownershipFilter);
  await db
    .collection("wishlistItems")
    .deleteMany(foreignKeyFilter("productId", normalizedProductId));
  return { deleted: true, archived: false };
}
