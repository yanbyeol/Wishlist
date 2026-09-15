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

export async function listProducts({ category = "", query = "" } = {}) {
  const db = await getDatabase();
  const filter = { status: { $in: ["active", "sold_out"] } };

  if (category) {
    filter.category = category;
  }

  if (query) {
    const expression = new RegExp(escapeRegularExpression(query), "i");
    filter.$or = [{ name: expression }, { description: expression }];
  }

  const products = await db
    .collection("products")
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();

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
