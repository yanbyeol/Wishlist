import { GROUP_GIFT_DURATION_DAYS } from "@/lib/constants";
import { getDatabase } from "@/lib/mongodb";
import {
  createNotificationSafely,
  getNotificationEventKey,
  NOTIFICATION_TYPES,
} from "@/lib/notifications";
import { createMockOrder } from "@/lib/orders";
import { getProductById } from "@/lib/products";
import { findUserById } from "@/lib/users";
import { isProductInWishlist } from "@/lib/wishlists";
import { getStartedGroupGiftFilter } from "@/lib/utils/group-gift";
import {
  documentIdFilter,
  foreignKeyCandidates,
  foreignKeyFilter,
  normalizeId,
} from "@/lib/utils/mongo";

function presentContribution(contribution) {
  return {
    id: normalizeId(contribution._id),
    userId: contribution.userId ? normalizeId(contribution.userId) : null,
    participantType: contribution.participantType ?? "member",
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

export async function findStartedGroupGiftForProduct(recipientId, productId) {
  const db = await getDatabase();
  const groupGiftDocument = await db.collection("groupGifts").findOne({
    ...foreignKeyFilter("recipientId", recipientId),
    ...foreignKeyFilter("productId", productId),
    ...getStartedGroupGiftFilter(),
  });

  return presentGroupGift(groupGiftDocument);
}

export async function findStartedGroupGiftsForProducts(recipientId, productIds) {
  const normalizedProductIds = productIds.map(normalizeId).filter(Boolean);

  if (normalizedProductIds.length === 0) {
    return [];
  }

  const db = await getDatabase();
  const groupGiftDocuments = await db.collection("groupGifts").find({
    ...foreignKeyFilter("recipientId", recipientId),
    productId: { $in: foreignKeyCandidates(normalizedProductIds) },
    ...getStartedGroupGiftFilter(),
  }).toArray();

  return groupGiftDocuments.map(presentGroupGift);
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

  if (
    initial.status === "funding" &&
    Number(initial.currentAmount) <= 0 &&
    !(await isProductInWishlist(initial.recipientId, initial.productId))
  ) {
    const result = await db.collection("groupGifts").updateOne(
      {
        _id: initial._id,
        status: "funding",
        currentAmount: { $lte: 0 },
      },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );

    if (result.matchedCount === 1) {
      initial.status = "cancelled";
    }
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
    .map((contribution) => contribution.message
      ? `${contribution.nickname ?? "익명의 친구"}: ${contribution.message}`
      : "")
    .filter(Boolean);

  try {
    const order = await createMockOrder({
      type: "group",
      senderId: groupGift.organizerId,
      recipientId: groupGift.recipientId,
      productId: groupGift.productId,
      message: "친구들이 함께 준비한 선물이에요.",
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
    await createNotificationSafely({
      userId: groupGift.recipientId,
      type: NOTIFICATION_TYPES.GROUP_GIFT_COMPLETED,
      title: "공동선물이 완성됐어요!",
      message: `${groupGift.title}의 목표 금액이 모두 모였습니다.`,
      link: `/orders/${order.id}`,
      eventKey: getNotificationEventKey(
        NOTIFICATION_TYPES.GROUP_GIFT_COMPLETED,
        groupGift.id,
      ),
    });
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
  guestEmail = "",
  nickname,
  amount,
  message,
}) {
  const db = await getDatabase();
  const memberId = normalizeId(userId);
  const normalizedGuestEmail = String(guestEmail).trim().toLowerCase();

  if (!memberId && !normalizedGuestEmail) {
    throw new Error("로그인 또는 이메일 인증이 필요합니다.");
  }

  const groupGiftDocument = await db
    .collection("groupGifts")
    .findOne(documentIdFilter(groupGiftId));

  if (!groupGiftDocument || groupGiftDocument.status !== "funding") {
    throw new Error("현재 함께 선물하기에 참여할 수 없습니다.");
  }

  if (new Date(groupGiftDocument.expiresAt) <= new Date()) {
    await db.collection("groupGifts").updateOne(
      { _id: groupGiftDocument._id, status: "funding" },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );
    throw new Error("함께 선물하기 모집 기간이 끝났습니다.");
  }

  if (
    Number(groupGiftDocument.currentAmount) <= 0 &&
    !(await isProductInWishlist(
      groupGiftDocument.recipientId,
      groupGiftDocument.productId,
    ))
  ) {
    const result = await db.collection("groupGifts").updateOne(
      {
        _id: groupGiftDocument._id,
        status: "funding",
        currentAmount: { $lte: 0 },
      },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );

    if (result.matchedCount === 1) {
      throw new Error("상품이 이미 선물되었거나 위시리스트에서 삭제되었습니다.");
    }
  }

  const remainingAmount = groupGiftDocument.targetAmount - groupGiftDocument.currentAmount;

  if (amount > remainingAmount) {
    throw new Error("남은 목표 금액보다 많이 참여할 수 없습니다.");
  }

  const now = new Date();
  const pendingContribution = {
    groupGiftId: normalizeId(groupGiftId),
    participantType: memberId ? "member" : "guest",
    userId: memberId || null,
    guestEmail: memberId ? null : normalizedGuestEmail,
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

  if (memberId !== normalizeId(updatedGroupGift.organizerId)) {
    await createNotificationSafely({
      userId: updatedGroupGift.organizerId,
      type: NOTIFICATION_TYPES.GROUP_GIFT_CONTRIBUTION,
      title: `${nickname}님이 공동선물에 참여했어요.`,
      message: `${updatedGroupGift.title ?? "공동선물"}에 새로운 마음이 모였습니다.`,
      link: `/group-gifts/${normalizeId(updatedGroupGift._id)}`,
      eventKey: getNotificationEventKey(
        NOTIFICATION_TYPES.GROUP_GIFT_CONTRIBUTION,
        contributionResult.insertedId,
      ),
    });
  }

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

function participantContributionFilter({ userId = "", guestEmail = "" }) {
  const memberId = normalizeId(userId);

  if (memberId) {
    return foreignKeyFilter("userId", memberId);
  }

  const normalizedGuestEmail = String(guestEmail).trim().toLowerCase();
  return normalizedGuestEmail ? { guestEmail: normalizedGuestEmail } : null;
}

export async function hasGroupGiftContribution({ groupGiftId, userId, guestEmail }) {
  const participantFilter = participantContributionFilter({ userId, guestEmail });

  if (!participantFilter) {
    return false;
  }

  const db = await getDatabase();
  const contribution = await db.collection("contributions").findOne({
    ...foreignKeyFilter("groupGiftId", groupGiftId),
    ...participantFilter,
    paymentStatus: "paid",
  });
  return Boolean(contribution);
}

export async function retryGroupGiftPayment(groupGiftId, participant) {
  const participantFilter = participantContributionFilter(participant);

  if (!participantFilter) {
    throw new Error("로그인 또는 이메일 인증이 필요합니다.");
  }

  const db = await getDatabase();
  const contribution = await db.collection("contributions").findOne({
    ...foreignKeyFilter("groupGiftId", groupGiftId),
    ...participantFilter,
    paymentStatus: "paid",
  });

  if (!contribution) {
    throw new Error("함께 선물하기 참여 내역이 있는 사람만 다시 처리할 수 있습니다.");
  }

  return finishFundedGroupGift(groupGiftId);
}
