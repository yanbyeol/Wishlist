import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const { ObjectId } = require("mongodb");
const { transformSync } = require("next/dist/build/swc");
const element = (type, props, key) => ({ type, props, key });
const jsxRuntime = { jsx: element, jsxs: element, Fragment: "fragment" };

function loadSource(path, dependencies, globals = {}) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      target: "es2022",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });
  const sourceModule = { exports: {} };
  runInNewContext(code, {
    module: sourceModule,
    exports: sourceModule.exports,
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name in dependencies) return dependencies[name];
      if (name.startsWith("node:")) return require(name);
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

const mongoFunctions = loadSource("lib/utils/mongo.js", {
  mongodb: require("mongodb"),
});

function valuesMatch(actual, expected) {
  if (expected && typeof expected === "object" && "$in" in expected) {
    return expected.$in.some((candidate) => String(candidate) === String(actual));
  }

  return String(actual) === String(expected);
}

function documentMatches(document, filter) {
  return Object.entries(filter).every(([field, expected]) => (
    valuesMatch(document[field], expected)
  ));
}

function createNotificationDatabase(initialDocuments = []) {
  const documents = initialDocuments;
  const collection = {
    async updateOne(filter, update) {
      const document = documents.find((item) => documentMatches(item, filter));

      if (update.$setOnInsert) {
        if (document) return { upsertedCount: 0, matchedCount: 1 };
        documents.push({ _id: filter._id, ...update.$setOnInsert });
        return { upsertedCount: 1, matchedCount: 0 };
      }

      if (document && update.$set) {
        Object.assign(document, update.$set);
        return { modifiedCount: 1, matchedCount: 1 };
      }

      return { modifiedCount: 0, matchedCount: 0 };
    },
    find(filter) {
      let rows = documents.filter((document) => documentMatches(document, filter));
      const cursor = {
        sort() {
          rows = rows.slice().sort((first, second) => second.createdAt - first.createdAt);
          return cursor;
        },
        limit(limit) {
          rows = rows.slice(0, limit);
          return cursor;
        },
        async toArray() {
          return rows;
        },
      };
      return cursor;
    },
    async countDocuments(filter) {
      return documents.filter((document) => documentMatches(document, filter)).length;
    },
    async findOneAndUpdate(filter, update) {
      const document = documents.find((item) => documentMatches(item, filter));
      if (!document) return null;
      Object.assign(document, update.$set);
      return document;
    },
  };
  return {
    documents,
    database: {
      collection(name) {
        assert.equal(name, "notifications");
        return collection;
      },
    },
  };
}

function loadNotifications(database) {
  return loadSource("lib/notifications.js", {
    mongodb: require("mongodb"),
    "@/lib/mongodb": { getDatabase: async () => database },
    "@/lib/utils/mongo": mongoFunctions,
  }, {
    console: { error() {} },
  });
}

test("같은 이벤트의 알림은 결정적 ObjectId로 한 번만 저장한다", async () => {
  const { database, documents } = createNotificationDatabase();
  const notifications = loadNotifications(database);
  const eventKey = notifications.getNotificationEventKey("GIFT_RECEIVED", "order-id");
  const input = {
    userId: "recipient-id",
    type: "GIFT_RECEIVED",
    title: "선물이 도착했어요!",
    message: "새로운 선물이 도착했습니다.",
    link: "/orders/order-id",
    eventKey,
  };

  const first = await notifications.createNotification(input);
  const duplicate = await notifications.createNotification(input);

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(documents.length, 1);
  assert.equal(documents[0]._id instanceof ObjectId, true);
  assert.equal(documents[0].userId, "recipient-id");
  assert.equal(documents[0].read, false);
});

test("알림 목록과 읽음 처리는 로그인 사용자 ID를 DB 조건에 함께 사용한다", async () => {
  const ownUnreadId = new ObjectId();
  const ownReadId = new ObjectId();
  const otherId = new ObjectId();
  const now = Date.now();
  const { database, documents } = createNotificationDatabase([
    {
      _id: ownUnreadId, userId: "member-id", type: "GIFT_RECEIVED", title: "새 알림",
      message: "확인해 주세요.", link: "/orders/new", read: false, createdAt: new Date(now),
    },
    {
      _id: ownReadId, userId: "member-id", type: "GIFT_RECEIVED", title: "읽은 알림",
      message: "이미 확인했습니다.", link: "/orders/old", read: true, createdAt: new Date(now - 1000),
    },
    {
      _id: otherId, userId: "other-id", type: "GIFT_RECEIVED", title: "다른 사용자 알림",
      message: "노출되면 안 됩니다.", link: "/orders/private", read: false, createdAt: new Date(now + 1000),
    },
  ]);
  const notifications = loadNotifications(database);

  const summary = await notifications.getNotificationSummary("member-id");
  assert.deepEqual(Array.from(summary.notifications, (item) => item.title), ["새 알림", "읽은 알림"]);
  assert.equal(summary.unreadCount, 1);

  assert.equal(await notifications.markNotificationRead(String(ownUnreadId), "other-id"), null);
  assert.equal(documents[0].read, false);
  const readNotification = await notifications.markNotificationRead(
    String(ownUnreadId),
    "member-id",
  );
  assert.equal(readNotification.read, true);
  assert.equal(documents[0].read, true);
});

test("알림 읽음 Server Action은 클라이언트 userId 대신 세션 사용자만 전달한다", async () => {
  const calls = [];
  const actions = loadSource("app/notifications/actions.js", {
    "@/lib/notifications": {
      async markNotificationRead(notificationId, userId) {
        calls.push({ notificationId, userId });
        return { link: "/orders/order-id" };
      },
    },
    "@/lib/session": { getCurrentUser: async () => ({ id: "session-user-id" }) },
  });

  const result = await actions.readNotificationAction("notification-id");
  assert.deepEqual(calls, [{ notificationId: "notification-id", userId: "session-user-id" }]);
  assert.equal(result.link, "/orders/order-id");
});

test("혼자 선물 주문 완료 뒤 수령·배송지 알림을 수령인에게 생성한다", async () => {
  const notificationCalls = [];
  const orderId = new ObjectId();
  const productId = new ObjectId();
  const product = {
    _id: productId,
    sellerId: "seller-id",
    name: "테스트 선물",
    price: 30000,
    quantity: 1,
    status: "active",
    imageUrl: "/images/test.jpg",
  };
  const database = {
    collection(name) {
      if (name === "products") {
        return {
          findOneAndUpdate: async () => product,
          updateOne: async () => ({ modifiedCount: 1 }),
        };
      }
      if (name === "orders") {
        return {
          insertOne: async () => ({ insertedId: orderId }),
          deleteOne: async () => {},
        };
      }
      if (name === "giftCards") {
        return {
          insertOne: async () => ({ insertedId: new ObjectId() }),
          deleteMany: async () => {},
        };
      }
      throw new Error(`예상하지 않은 컬렉션: ${name}`);
    },
  };
  const orders = loadSource("lib/orders.js", {
    "@/lib/ai/gift-card": {
      generateGiftCard: async () => ({
        title: "축하 카드",
        message: "축하해요",
        theme: "warm-confetti",
        generationProvider: "mock",
        status: "generated",
      }),
    },
    "@/lib/addresses": { getDefaultAddress: async () => null },
    "@/lib/mongodb": { getDatabase: async () => database },
    "@/lib/notifications": {
      async createNotificationSafely(notification) {
        notificationCalls.push({ ...notification });
      },
      getNotificationEventKey: (type, id) => `${type}:${id}`,
      markNotificationEventReadSafely: async () => {},
      NOTIFICATION_TYPES: {
        GIFT_RECEIVED: "GIFT_RECEIVED",
        GIFT_ADDRESS_REQUIRED: "GIFT_ADDRESS_REQUIRED",
      },
    },
    "@/lib/seller-order-filter": { getSellerOrderStatuses: (statuses) => statuses },
    "@/lib/users": { findUserById: async () => ({ id: "recipient-id", name: "받는 사람" }) },
    "@/lib/utils/mongo": mongoFunctions,
    "@/lib/wishlists": { removeProductFromRecipientWishlist: async () => {} },
  });

  const order = await orders.createMockOrder({
    type: "single",
    senderId: "sender-id",
    recipientId: "recipient-id",
    productId: String(productId),
    message: "축하해요",
  });

  assert.equal(order.status, "awaiting_address");
  assert.deepEqual(
    notificationCalls.map((notification) => notification.title),
    ["선물이 도착했어요!", "배송지를 입력해주세요."],
  );
  assert.equal(notificationCalls.every((notification) => notification.userId === "recipient-id"), true);
  assert.equal(notificationCalls[1].link.startsWith("/gifts/accept/"), true);
});

test("다른 참여자의 공동선물 참여는 DB의 개설자에게 닉네임 알림을 생성한다", async () => {
  const notificationCalls = [];
  const groupGift = {
    _id: "group-gift-id",
    organizerId: "organizer-id",
    recipientId: "recipient-id",
    productId: "product-id",
    title: "함께 준비하는 선물",
    targetAmount: 50000,
    currentAmount: 10000,
    status: "funding",
    expiresAt: new Date(Date.now() + 86400000),
  };
  const database = {
    collection(name) {
      if (name === "groupGifts") {
        return {
          findOne: async () => groupGift,
          findOneAndUpdate: async () => ({ ...groupGift, currentAmount: 20000 }),
          updateOne: async () => ({ matchedCount: 1 }),
        };
      }
      if (name === "contributions") {
        return {
          insertOne: async () => ({ insertedId: "contribution-id" }),
          updateOne: async () => ({ modifiedCount: 1 }),
        };
      }
      throw new Error(`예상하지 않은 컬렉션: ${name}`);
    },
  };
  const groupGifts = loadSource("lib/group-gifts.js", {
    "@/lib/constants": { GROUP_GIFT_DURATION_DAYS: 14 },
    "@/lib/mongodb": { getDatabase: async () => database },
    "@/lib/notifications": {
      async createNotificationSafely(notification) {
        notificationCalls.push({ ...notification });
      },
      getNotificationEventKey: (type, id) => `${type}:${id}`,
      NOTIFICATION_TYPES: {
        GROUP_GIFT_COMPLETED: "GROUP_GIFT_COMPLETED",
        GROUP_GIFT_CONTRIBUTION: "GROUP_GIFT_CONTRIBUTION",
      },
    },
    "@/lib/orders": { createMockOrder: async () => null },
    "@/lib/products": { getProductById: async () => null },
    "@/lib/users": { findUserById: async () => null },
    "@/lib/wishlists": { isProductInWishlist: async () => true },
    "@/lib/utils/group-gift": { getStartedGroupGiftFilter: () => ({}) },
    "@/lib/utils/mongo": mongoFunctions,
  });

  await groupGifts.contributeToGroupGift({
    groupGiftId: "group-gift-id",
    userId: "participant-id",
    nickname: "민지",
    amount: 10000,
    message: "축하해요",
  });

  assert.equal(notificationCalls.length, 1);
  assert.equal(notificationCalls[0].userId, "organizer-id");
  assert.equal(notificationCalls[0].title, "민지님이 공동선물에 참여했어요.");
  assert.equal(notificationCalls[0].link, "/group-gifts/group-gift-id");
});

test("공동선물 목표 달성 알림은 완료 처리에 성공한 한 번만 수령인에게 생성한다", async () => {
  const notificationCalls = [];
  let canFinish = true;
  const completedGroupGift = {
    _id: "group-gift-id",
    organizerId: "organizer-id",
    recipientId: "recipient-id",
    productId: "product-id",
    title: "생일 공동선물",
    targetAmount: 50000,
    currentAmount: 50000,
    status: "processing",
    orderId: null,
    expiresAt: new Date(Date.now() + 86400000),
  };
  const database = {
    collection(name) {
      if (name === "groupGifts") {
        return {
          async findOneAndUpdate() {
            if (!canFinish) return null;
            canFinish = false;
            return completedGroupGift;
          },
          updateOne: async () => ({ matchedCount: 1 }),
        };
      }
      if (name === "contributions") {
        return {
          findOne: async () => ({ _id: "contribution-id", paymentStatus: "paid" }),
          find() {
            return {
              toArray: async () => [{ nickname: "민지", message: "축하해요", paymentStatus: "paid" }],
            };
          },
        };
      }
      throw new Error(`예상하지 않은 컬렉션: ${name}`);
    },
  };
  const groupGifts = loadSource("lib/group-gifts.js", {
    "@/lib/constants": { GROUP_GIFT_DURATION_DAYS: 14 },
    "@/lib/mongodb": { getDatabase: async () => database },
    "@/lib/notifications": {
      async createNotificationSafely(notification) {
        notificationCalls.push({ ...notification });
      },
      getNotificationEventKey: (type, id) => `${type}:${id}`,
      NOTIFICATION_TYPES: {
        GROUP_GIFT_COMPLETED: "GROUP_GIFT_COMPLETED",
        GROUP_GIFT_CONTRIBUTION: "GROUP_GIFT_CONTRIBUTION",
      },
    },
    "@/lib/orders": { createMockOrder: async () => ({ id: "order-id" }) },
    "@/lib/products": { getProductById: async () => null },
    "@/lib/users": { findUserById: async () => null },
    "@/lib/wishlists": { isProductInWishlist: async () => true },
    "@/lib/utils/group-gift": { getStartedGroupGiftFilter: () => ({}) },
    "@/lib/utils/mongo": mongoFunctions,
  });

  const firstOrder = await groupGifts.retryGroupGiftPayment("group-gift-id", {
    userId: "participant-id",
  });
  const duplicateOrder = await groupGifts.retryGroupGiftPayment("group-gift-id", {
    userId: "participant-id",
  });

  assert.equal(firstOrder.id, "order-id");
  assert.equal(duplicateOrder, null);
  assert.equal(notificationCalls.length, 1);
  assert.equal(notificationCalls[0].userId, "recipient-id");
  assert.equal(notificationCalls[0].title, "공동선물이 완성됐어요!");
  assert.equal(notificationCalls[0].eventKey, "GROUP_GIFT_COMPLETED:group-gift-id");
});

function findElements(tree, predicate) {
  const found = [];
  function visit(node) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return found;
}

test("공동선물 축하 메시지는 작성한 참여자마다 독립된 소형 카드로 렌더링한다", () => {
  const GroupGiftMessageCards = loadSource(
    "components/group-gift-message-cards.js",
    {},
  ).default;
  const tree = GroupGiftMessageCards({
    contributions: [
      { id: "one", nickname: "한별", message: "생일 축하해!" },
      { id: "two", nickname: "민지", message: "항상 행복하자 :)" },
      { id: "three", nickname: "도윤", message: "   " },
    ],
  });
  const cards = findElements(tree, (node) => node.props.className === "group-message-card");

  assert.equal(cards.length, 2);
  assert.deepEqual(
    cards.map((card) => findElements(card, (node) => node.type === "strong")[0].props.children),
    ["한별", "민지"],
  );
  assert.equal(findElements(cards[0], (node) => node.type === "blockquote").length, 1);
  assert.equal(findElements(cards[1], (node) => node.type === "blockquote").length, 1);
});
