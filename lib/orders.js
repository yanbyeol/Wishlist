import { randomUUID } from "node:crypto";
import { generateGiftCard } from "@/lib/ai/gift-card";
import { getDefaultAddress } from "@/lib/addresses";
import { getDatabase } from "@/lib/mongodb";
import { findUserById } from "@/lib/users";
import {
  documentIdFilter,
  foreignKeyFilter,
  normalizeId,
} from "@/lib/utils/mongo";
import { removeProductFromRecipientWishlist } from "@/lib/wishlists";

function presentOrder(order) {
  if (!order) {
    return null;
  }

  return {
    id: normalizeId(order._id),
    type: order.type,
    senderId: normalizeId(order.senderId),
    recipientId: normalizeId(order.recipientId),
    sellerId: normalizeId(order.sellerId),
    productId: normalizeId(order.productId),
    productSnapshot: order.productSnapshot,
    totalAmount: order.totalAmount,
    message: order.message,
    status: order.status,
    paymentStatus: order.paymentStatus,
    shippingAddress: order.shippingAddress ?? null,
    delivery: order.delivery ?? null,
    groupGiftId: order.groupGiftId ? normalizeId(order.groupGiftId) : null,
    createdAt: order.createdAt?.toISOString?.() ?? order.createdAt,
    updatedAt: order.updatedAt?.toISOString?.() ?? order.updatedAt,
  };
}

function presentGiftCard(card) {
  if (!card) {
    return null;
  }

  return {
    id: normalizeId(card._id),
    orderId: normalizeId(card.orderId),
    recipientId: normalizeId(card.recipientId),
    title: card.title,
    message: card.message,
    theme: card.theme,
    generationProvider: card.generationProvider,
    status: card.status,
    acceptanceToken: card.acceptanceToken,
    acceptancePath: card.acceptancePath,
    acceptedAt: card.acceptedAt?.toISOString?.() ?? card.acceptedAt ?? null,
  };
}

async function reserveProduct(productId) {
  const db = await getDatabase();
  const product = await db.collection("products").findOneAndUpdate(
    {
      ...documentIdFilter(productId),
      quantity: { $gt: 0 },
      status: { $ne: "archived" },
    },
    { $inc: { quantity: -1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!product) {
    throw new Error("상품이 품절되었거나 더 이상 판매하지 않습니다.");
  }

  if (product.quantity === 0) {
    await db.collection("products").updateOne(
      { _id: product._id },
      { $set: { status: "sold_out", updatedAt: new Date() } },
    );
  }

  return product;
}

async function restoreProduct(productId) {
  const db = await getDatabase();
  await db.collection("products").updateOne(documentIdFilter(productId), {
    $inc: { quantity: 1 },
    $set: { status: "active", updatedAt: new Date() },
  });
}

export async function createMockOrder({
  type,
  senderId,
  recipientId,
  productId,
  message,
  groupGiftId = null,
  cardMessages = [],
}) {
  const db = await getDatabase();
  const product = await reserveProduct(productId);
  const recipient = await findUserById(recipientId);

  if (!recipient) {
    await restoreProduct(productId);
    throw new Error("선물을 받을 회원을 찾을 수 없습니다.");
  }

  const defaultAddress =
    normalizeId(senderId) === normalizeId(recipientId)
      ? await getDefaultAddress(recipientId)
      : null;
  const now = new Date();
  const order = {
    type,
    senderId: normalizeId(senderId),
    recipientId: normalizeId(recipientId),
    sellerId: normalizeId(product.sellerId),
    productId: normalizeId(product._id),
    productSnapshot: {
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl ?? product.images?.[0] ?? "",
    },
    quantity: 1,
    totalAmount: product.price,
    currency: "KRW",
    groupGiftId: groupGiftId ? normalizeId(groupGiftId) : null,
    message,
    status: defaultAddress ? "preparing" : "awaiting_address",
    paymentStatus: "paid",
    paymentProvider: "mock",
    paymentId: `mock-${randomUUID()}`,
    shippingAddress: defaultAddress
      ? {
          recipientName: defaultAddress.recipientName,
          phone: defaultAddress.phone,
          postalCode: defaultAddress.postalCode,
          address1: defaultAddress.address1,
          address2: defaultAddress.address2,
        }
      : null,
    delivery: {
      provider: "mock",
      trackingNumber: null,
      shippedAt: null,
      deliveredAt: null,
    },
    createdAt: now,
    updatedAt: now,
  };

  let orderId;

  try {
    const orderResult = await db.collection("orders").insertOne(order);
    orderId = orderResult.insertedId;
    const generatedCard = await generateGiftCard({
      recipientName: recipient.name,
      productName: product.name,
      messages: cardMessages.length ? cardMessages : [message],
    });
    const acceptanceToken = randomUUID().replaceAll("-", "");
    await db.collection("giftCards").insertOne({
      orderId: normalizeId(orderId),
      recipientId: normalizeId(recipientId),
      ...generatedCard,
      acceptanceToken,
      acceptancePath: `/gifts/accept/${acceptanceToken}`,
      acceptedAt: defaultAddress ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    await removeProductFromRecipientWishlist(recipientId, productId);
  } catch (error) {
    if (orderId) {
      await db.collection("orders").deleteOne({ _id: orderId });
      await db
        .collection("giftCards")
        .deleteMany(foreignKeyFilter("orderId", normalizeId(orderId)));
    }

    await restoreProduct(productId);
    throw error;
  }

  return presentOrder({ ...order, _id: orderId });
}

export async function getOrderDetails(orderId) {
  const db = await getDatabase();
  const orderDocument = await db.collection("orders").findOne(documentIdFilter(orderId));

  if (!orderDocument) {
    return null;
  }

  const order = presentOrder(orderDocument);
  const [cardDocument, sender, recipient] = await Promise.all([
    db.collection("giftCards").findOne(foreignKeyFilter("orderId", order.id)),
    findUserById(order.senderId),
    findUserById(order.recipientId),
  ]);

  return { ...order, card: presentGiftCard(cardDocument), sender, recipient };
}

export async function listReceivedOrders(userId) {
  const db = await getDatabase();
  const orders = await db
    .collection("orders")
    .find(foreignKeyFilter("recipientId", userId))
    .sort({ createdAt: -1 })
    .toArray();
  const results = [];

  for (const orderDocument of orders) {
    const order = presentOrder(orderDocument);
    const cardDocument = await db
      .collection("giftCards")
      .findOne(foreignKeyFilter("orderId", order.id));
    results.push({ ...order, card: presentGiftCard(cardDocument) });
  }

  return results;
}

export async function listSellerOrders(sellerId) {
  const db = await getDatabase();
  const orders = await db
    .collection("orders")
    .find(foreignKeyFilter("sellerId", sellerId))
    .sort({ createdAt: -1 })
    .toArray();
  return orders.map(presentOrder);
}

export async function updateSellerOrderStatus(orderId, sellerId, status) {
  const db = await getDatabase();
  const update = { status, updatedAt: new Date() };

  if (status === "shipped") {
    update["delivery.trackingNumber"] = `WM-${normalizeId(orderId).slice(-8).toUpperCase()}`;
    update["delivery.shippedAt"] = new Date();
  }

  if (status === "delivered") {
    update["delivery.deliveredAt"] = new Date();
  }

  const result = await db.collection("orders").updateOne(
    {
      ...documentIdFilter(orderId),
      ...foreignKeyFilter("sellerId", sellerId),
      ...(status === "shipped" || status === "delivered"
        ? { shippingAddress: { $ne: null } }
        : {}),
    },
    { $set: update },
  );
  return result.modifiedCount === 1 || result.matchedCount === 1;
}

export async function getGiftByAcceptanceToken(token) {
  const db = await getDatabase();
  const cardDocument = await db.collection("giftCards").findOne({ acceptanceToken: token });

  if (!cardDocument) {
    return null;
  }

  const orderDocument = await db
    .collection("orders")
    .findOne(documentIdFilter(cardDocument.orderId));

  if (!orderDocument) {
    return null;
  }

  return {
    card: presentGiftCard(cardDocument),
    order: presentOrder(orderDocument),
  };
}

export async function acceptGiftWithAddress(token, fields) {
  const db = await getDatabase();
  const card = await db.collection("giftCards").findOne({ acceptanceToken: token });

  if (!card) {
    return null;
  }

  const order = await db.collection("orders").findOne(documentIdFilter(card.orderId));

  if (!order) {
    return null;
  }

  const now = new Date();
  await db.collection("orders").updateOne(
    { _id: order._id },
    {
      $set: {
        shippingAddress: fields,
        status: "preparing",
        updatedAt: now,
      },
    },
  );
  await db.collection("giftCards").updateOne(
    { _id: card._id },
    { $set: { acceptedAt: now, updatedAt: now } },
  );

  return presentOrder({
    ...order,
    shippingAddress: fields,
    status: "preparing",
    updatedAt: now,
  });
}
