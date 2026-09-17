import { randomUUID } from "node:crypto";
import { generateGiftCard } from "@/lib/ai/gift-card";
import { getDefaultAddress } from "@/lib/addresses";
import { getDatabase } from "@/lib/mongodb";
import {
  createNotificationSafely,
  getNotificationEventKey,
  markNotificationEventReadSafely,
  NOTIFICATION_TYPES,
} from "@/lib/notifications";
import { getSellerOrderStatuses } from "@/lib/seller-order-filter";
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

function presentContribution(contribution) {
  return {
    id: normalizeId(contribution._id),
    name: contribution.nickname ?? "익명의 친구",
    amount: contribution.amount,
    message: contribution.message ?? "",
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
  let acceptancePath;

  try {
    const orderResult = await db.collection("orders").insertOne(order);
    orderId = orderResult.insertedId;
    const generatedCard = await generateGiftCard({
      recipientName: recipient.name,
      productName: product.name,
      messages: cardMessages.length ? cardMessages : [message],
    });
    const acceptanceToken = randomUUID().replaceAll("-", "");
    acceptancePath = `/gifts/accept/${acceptanceToken}`;
    await db.collection("giftCards").insertOne({
      orderId: normalizeId(orderId),
      recipientId: normalizeId(recipientId),
      ...generatedCard,
      acceptanceToken,
      acceptancePath,
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

  const normalizedOrderId = normalizeId(orderId);
  const notificationJobs = [];

  if (type === "single") {
    notificationJobs.push(createNotificationSafely({
      userId: recipientId,
      type: NOTIFICATION_TYPES.GIFT_RECEIVED,
      title: "선물이 도착했어요!",
      message: `${product.name} 선물이 도착했습니다.`,
      link: `/orders/${normalizedOrderId}`,
      eventKey: getNotificationEventKey(
        NOTIFICATION_TYPES.GIFT_RECEIVED,
        normalizedOrderId,
      ),
    }));
  }

  if (order.status === "awaiting_address" && acceptancePath) {
    notificationJobs.push(createNotificationSafely({
      userId: recipientId,
      type: NOTIFICATION_TYPES.GIFT_ADDRESS_REQUIRED,
      title: "배송지를 입력해주세요.",
      message: `${product.name} 선물을 받으려면 배송지를 입력해 주세요.`,
      link: acceptancePath,
      eventKey: getNotificationEventKey(
        NOTIFICATION_TYPES.GIFT_ADDRESS_REQUIRED,
        normalizedOrderId,
      ),
    }));
  }

  await Promise.all(notificationJobs);

  return presentOrder({ ...order, _id: orderId });
}

export async function getOrderDetails(orderId, viewerId, view = "") {
  const db = await getDatabase();
  const orderDocument = await db.collection("orders").findOne(documentIdFilter(orderId));

  if (!orderDocument) {
    return null;
  }

  const order = presentOrder(orderDocument);
  const normalizedViewerId = normalizeId(viewerId);
  const isGroupOrder = order.type === "group" && order.groupGiftId;
  const isRecipient = normalizedViewerId === order.recipientId;
  const isSender = normalizedViewerId === order.senderId;
  const isSeller = normalizedViewerId === order.sellerId;
  let viewerRole = "";

  if (isRecipient) {
    viewerRole = "recipient";
  } else if (isSender) {
    viewerRole = "sender";
  } else if (isSeller) {
    viewerRole = "seller";
  }

  if (!viewerRole && normalizedViewerId && isGroupOrder) {
    const paidContribution = await db.collection("contributions").findOne(
      {
        ...foreignKeyFilter("groupGiftId", order.groupGiftId),
        ...foreignKeyFilter("userId", normalizedViewerId),
        paymentStatus: "paid",
      },
      { projection: { _id: 1 } },
    );

    if (paidContribution) {
      viewerRole = "participant";
    }
  }

  if (!viewerRole) {
    return null;
  }

  const isSentView = view === "sent" && isSender;
  const isSellerView = view === "seller" && isSeller;
  const canViewShippingAddress = !isSentView && (
    isRecipient || (isSeller && !isSender) || isSellerView
  );
  const [cardDocument, sender, recipient, groupGiftDocument, contributionDocuments] = await Promise.all([
    db.collection("giftCards").findOne(foreignKeyFilter("orderId", order.id)),
    findUserById(order.senderId),
    findUserById(order.recipientId),
    isGroupOrder
      ? db.collection("groupGifts").findOne(documentIdFilter(order.groupGiftId))
      : null,
    isGroupOrder
      ? db.collection("contributions").find({
        ...foreignKeyFilter("groupGiftId", order.groupGiftId),
        paymentStatus: "paid",
      }).sort({ createdAt: 1 }).toArray()
      : [],
  ]);

  return {
    ...order,
    viewerRole,
    shippingAddress: canViewShippingAddress ? order.shippingAddress : null,
    card: presentGiftCard(cardDocument),
    sender,
    recipient,
    groupGift: groupGiftDocument
      ? { targetAmount: groupGiftDocument.targetAmount }
      : null,
    contributions: contributionDocuments.map(presentContribution),
  };
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

export async function getAddressRequiredGiftSummary(userId) {
  const db = await getDatabase();
  const filter = {
    ...foreignKeyFilter("recipientId", userId),
    status: "awaiting_address",
  };
  const [count, orderDocuments] = await Promise.all([
    db.collection("orders").countDocuments(filter),
    db.collection("orders")
      .find(filter, {
        projection: {
          _id: 1,
          productSnapshot: 1,
          createdAt: 1,
        },
      })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray(),
  ]);
  const orderDocument = orderDocuments[0];

  if (!orderDocument) {
    return null;
  }

  const orderId = normalizeId(orderDocument._id);
  const cardDocument = await db.collection("giftCards").findOne(
    foreignKeyFilter("orderId", orderId),
    { projection: { acceptancePath: 1 } },
  );

  if (!cardDocument?.acceptancePath) {
    return null;
  }

  return {
    count,
    orderId,
    productName: orderDocument.productSnapshot?.name ?? "선물",
    acceptancePath: cardDocument.acceptancePath,
  };
}

export async function listSentOrders(userId) {
  const db = await getDatabase();
  const orders = await db
    .collection("orders")
    .find(
      foreignKeyFilter("senderId", userId),
      {
        projection: {
          _id: 1,
          recipientId: 1,
          productSnapshot: 1,
          status: 1,
          createdAt: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .toArray();
  const results = [];

  for (const orderDocument of orders) {
    const orderId = normalizeId(orderDocument._id);
    const recipientId = normalizeId(orderDocument.recipientId);
    const [cardDocument, recipient] = await Promise.all([
      db.collection("giftCards").findOne(
        foreignKeyFilter("orderId", orderId),
        { projection: { message: 1, acceptancePath: 1 } },
      ),
      findUserById(recipientId),
    ]);
    results.push({
      id: orderId,
      productSnapshot: orderDocument.productSnapshot,
      status: orderDocument.status,
      createdAt: orderDocument.createdAt?.toISOString?.() ?? orderDocument.createdAt,
      card: cardDocument
        ? {
            message: cardDocument.message,
            acceptancePath: cardDocument.acceptancePath,
          }
        : null,
      recipient: recipient ? { name: recipient.name } : null,
    });
  }

  return results;
}

export async function listSellerOrders(sellerId, statuses) {
  const db = await getDatabase();
  const orderDocuments = await db
    .collection("orders")
    .find(
      {
        ...foreignKeyFilter("sellerId", sellerId),
        status: { $in: getSellerOrderStatuses(statuses) },
      },
      {
        projection: {
          _id: 1, "productSnapshot.name": 1, totalAmount: 1, status: 1,
          createdAt: 1, shippingAddress: 1, senderId: 1, recipientId: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .toArray();
  return Promise.all(
    orderDocuments.map(async (order) => {
      const [sender, recipient] = await Promise.all([
        findUserById(order.senderId),
        findUserById(order.recipientId),
      ]);
      return {
        id: normalizeId(order._id),
        productSnapshot: { name: order.productSnapshot?.name ?? "" },
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt?.toISOString?.() ?? order.createdAt,
        shippingAddress: order.shippingAddress ?? null,
        sender: sender ? { name: sender.name, email: sender.email } : null,
        recipient: recipient ? { name: recipient.name, email: recipient.email } : null,
      };
    }),
  );
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
      ...(status !== "awaiting_address"
        ? { shippingAddress: { $ne: null } }
        : {}),
    },
    { $set: update },
  );
  return result.modifiedCount === 1 || result.matchedCount === 1;
}

export async function getGiftByAcceptanceToken(
  token,
  { includeContributions = false } = {},
) {
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

  const order = presentOrder(orderDocument);
  const shouldLoadContributions = includeContributions && order.type === "group" && order.groupGiftId;
  const [sender, contributionDocuments] = await Promise.all([
    findUserById(order.senderId),
    shouldLoadContributions
      ? db.collection("contributions").find({
        ...foreignKeyFilter("groupGiftId", order.groupGiftId),
        paymentStatus: "paid",
      }).sort({ createdAt: 1 }).toArray()
      : [],
  ]);

  return {
    card: presentGiftCard(cardDocument),
    order,
    sender,
    contributions: contributionDocuments.map(presentContribution),
  };
}

export async function acceptGiftWithAddress(token, recipientId, fields) {
  const db = await getDatabase();
  const card = await db.collection("giftCards").findOne({ acceptanceToken: token });

  if (!card) {
    return null;
  }

  const order = await db.collection("orders").findOne(documentIdFilter(card.orderId));

  if (
    !order ||
    normalizeId(order.recipientId) !== normalizeId(recipientId) ||
    card.acceptedAt
  ) {
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
  await markNotificationEventReadSafely(
    getNotificationEventKey(
      NOTIFICATION_TYPES.GIFT_ADDRESS_REQUIRED,
      normalizeId(order._id),
    ),
    recipientId,
  );

  return presentOrder({
    ...order,
    shippingAddress: fields,
    status: "preparing",
    updatedAt: now,
  });
}
