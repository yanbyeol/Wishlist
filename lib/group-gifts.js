import { GROUP_GIFT_DURATION_DAYS } from "@/lib/constants";
import { getDatabase } from "@/lib/mongodb";
import { createMockOrder } from "@/lib/orders";
import { getProductById } from "@/lib/products";
import { findUserById } from "@/lib/users";
import {
  documentIdFilter,
  foreignKeyFilter,
  normalizeId,
} from "@/lib/utils/mongo";

function presentContribution(contribution) {
  return {
    id: normalizeId(contribution._id),
    userId: normalizeId(contribution.userId),
    nickname: contribution.nickname ?? "익명의 친구",
    amount: contribution.amount,
    message: contribution.message,
    paymentStatus: contribution.paymentStatus,
    createdAt: contribution.createdAt?.toISOString?.() ?? contribution.createdAt,
  };
}

function presentGroupGift(groupGift) {
  if (!groupGift) {
    return null;
  }

  return {
    id: normalizeId(groupGift._id),
    organizerId: normalizeId(groupGift.organizerId),
    recipientId: normalizeId(groupGift.recipientId),
    productId: normalizeId(groupGift.productId),
    title: groupGift.title,
    targetAmount: groupGift.targetAmount,
    currentAmount: groupGift.currentAmount,
    status: groupGift.status,
    expiresAt: groupGift.expiresAt?.toISOString?.() ?? groupGift.expiresAt,
    orderId: groupGift.orderId ? normalizeId(groupGift.orderId) : null,
    createdAt: groupGift.createdAt?.toISOString?.() ?? groupGift.createdAt,
  };
}

export async function createGroupGift({ organizerId, recipientId, product, title }) {
  const db = await getDatabase();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + GROUP_GIFT_DURATION_DAYS);
  const groupGift = {
    organizerId: normalizeId(organizerId),
    recipientId: normalizeId(recipientId),
    productId: normalizeId(product.id),
    title,
    targetAmount: product.price,
    currentAmount: 0,
    status: "funding",
    expiresAt,
    orderId: null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("groupGifts").insertOne(groupGift);
  return presentGroupGift({ ...groupGift, _id: result.insertedId });
}

export async function findOpenGroupGiftForProduct(recipientId, productId) {
  const db = await getDatabase();
  const groupGiftDocument = await db.collection("groupGifts").findOne({
    ...foreignKeyFilter("recipientId", recipientId),
    ...foreignKeyFilter("productId", productId),
    $or: [
      { status: "funding", expiresAt: { $gt: new Date() } },
      { status: { $in: ["funded", "processing", "payment_failed"] } },
    ],
  });

  return presentGroupGift(groupGiftDocument);
}

export async function getGroupGiftById(groupGiftId) {
  const db = await getDatabase();
  const initial = await db.collection("groupGifts").findOne(documentIdFilter(groupGiftId));

  if (!initial) {
    return null;
  }

  if (initial.status === "funding" && new Date(initial.expiresAt) <= new Date()) {
    await db.collection("groupGifts").updateOne(
      { _id: initial._id, status: "funding" },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );
    initial.status = "cancelled";
  }

  const groupGift = presentGroupGift(initial);
  const contributionDocuments = await db
    .collection("contributions")
    .find({
      ...foreignKeyFilter("groupGiftId", groupGift.id),
      paymentStatus: "paid",
    })
    .sort({ createdAt: 1 })
    .toArray();
  const [product, organizer, recipient] = await Promise.all([
    getProductById(groupGift.productId),
    findUserById(groupGift.organizerId),
    findUserById(groupGift.recipientId),
  ]);

  return {
    ...groupGift,
    product,
    organizer,
    recipient,
    contributions: contributionDocuments.map(presentContribution),
  };
}

async function finishFundedGroupGift(groupGiftId) {
  const db = await getDatabase();
  const groupGiftDocument = await db.collection("groupGifts").findOneAndUpdate(
    {
      ...documentIdFilter(groupGiftId),
      status: { $in: ["funded", "payment_failed"] },
      orderId: null,
    },
    { $set: { status: "processing", updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!groupGiftDocument) {
    return null;
  }

  const groupGift = presentGroupGift(groupGiftDocument);
  const contributionDocuments = await db
    .collection("contributions")
    .find({
      ...foreignKeyFilter("groupGiftId", groupGift.id),
      paymentStatus: "paid",
    })
    .toArray();
  const messages = contributionDocuments
    .map((contribution) => contribution.message)
    .filter(Boolean);

  try {
    const order = await createMockOrder({
      type: "group",
      senderId: groupGift.organizerId,
      recipientId: groupGift.recipientId,
      productId: groupGift.productId,
      message: "친구들이 마음을 모아 준비한 선물이에요.",
      groupGiftId: groupGift.id,
      cardMessages: messages,
    });
    await db.collection("groupGifts").updateOne(
      { _id: groupGiftDocument._id },
      {
        $set: {
          status: "completed",
          orderId: order.id,
          updatedAt: new Date(),
        },
      },
    );
    return order;
  } catch (error) {
    await db.collection("groupGifts").updateOne(
      { _id: groupGiftDocument._id },
      { $set: { status: "payment_failed", updatedAt: new Date() } },
    );
    throw error;
  }
}

export async function contributeToGroupGift({
  groupGiftId,
  userId,
  nickname,
  amount,
  message,
}) {
  const db = await getDatabase();
  const groupGiftDocument = await db
    .collection("groupGifts")
    .findOne(documentIdFilter(groupGiftId));

  if (!groupGiftDocument || groupGiftDocument.status !== "funding") {
    throw new Error("현재 참여할 수 없는 공동선물입니다.");
  }

  if (new Date(groupGiftDocument.expiresAt) <= new Date()) {
    await db.collection("groupGifts").updateOne(
      { _id: groupGiftDocument._id, status: "funding" },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );
    throw new Error("공동선물 모집 기간이 끝났습니다.");
  }

  const remainingAmount = groupGiftDocument.targetAmount - groupGiftDocument.currentAmount;

  if (amount > remainingAmount) {
    throw new Error("남은 목표 금액보다 많이 참여할 수 없습니다.");
  }

  const now = new Date();
  const pendingContribution = {
    groupGiftId: normalizeId(groupGiftId),
    userId: normalizeId(userId),
    nickname,
    amount,
    message,
    paymentStatus: "pending",
    paymentProvider: "mock",
    paymentId: null,
    createdAt: now,
    updatedAt: now,
  };
  const contributionResult = await db
    .collection("contributions")
    .insertOne(pendingContribution);
  const updatedGroupGift = await db.collection("groupGifts").findOneAndUpdate(
    {
      _id: groupGiftDocument._id,
      status: "funding",
      currentAmount: { $lte: groupGiftDocument.targetAmount - amount },
    },
    { $inc: { currentAmount: amount }, $set: { updatedAt: now } },
    { returnDocument: "after" },
  );

  if (!updatedGroupGift) {
    await db.collection("contributions").deleteOne({ _id: contributionResult.insertedId });
    throw new Error("다른 참여로 목표 금액이 달성되었습니다. 새로고침해 주세요.");
  }

  await db.collection("contributions").updateOne(
    { _id: contributionResult.insertedId },
    {
      $set: {
        paymentStatus: "paid",
        paymentId: `mock-contribution-${normalizeId(contributionResult.insertedId)}`,
        updatedAt: new Date(),
      },
    },
  );

  let order = null;

  if (updatedGroupGift.currentAmount === updatedGroupGift.targetAmount) {
    await db.collection("groupGifts").updateOne(
      { _id: updatedGroupGift._id, status: "funding" },
      { $set: { status: "funded", updatedAt: new Date() } },
    );
    order = await finishFundedGroupGift(groupGiftId);
  }

  return { contributionId: normalizeId(contributionResult.insertedId), order };
}

export async function retryGroupGiftPayment(groupGiftId, userId) {
  const db = await getDatabase();
  const contribution = await db.collection("contributions").findOne({
    ...foreignKeyFilter("groupGiftId", groupGiftId),
    ...foreignKeyFilter("userId", userId),
    paymentStatus: "paid",
  });

  if (!contribution) {
    throw new Error("참여 내역이 있는 사람만 다시 처리할 수 있습니다.");
  }

  return finishFundedGroupGift(groupGiftId);
}
