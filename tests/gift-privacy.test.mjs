import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
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

const shippingAddress = {
  recipientName: "받는 사람",
  phone: "010-1234-5678",
  postalCode: "12345",
  address1: "테스트시 선물로 123",
  address2: "101호",
};
const orderDocument = {
  _id: "order-id",
  type: "single",
  senderId: "sender-id",
  recipientId: "recipient-id",
  sellerId: "seller-id",
  productId: "product-id",
  productSnapshot: {
    name: "테스트 선물",
    imageUrl: "/images/test.jpg",
  },
  totalAmount: 30000,
  message: "축하해요",
  status: "preparing",
  paymentStatus: "paid",
  shippingAddress,
  delivery: { trackingNumber: null },
  groupGiftId: null,
  createdAt: new Date("2026-09-17T00:00:00.000Z"),
  updatedAt: new Date("2026-09-17T00:00:00.000Z"),
};
const cardDocument = {
  _id: "card-id",
  orderId: "order-id",
  recipientId: "recipient-id",
  title: "축하 카드",
  message: "행복한 하루 보내세요",
  theme: "warm-confetti",
  generationProvider: "mock",
  status: "ready",
  acceptanceToken: "secret-token",
  acceptancePath: "/gifts/accept/secret-token",
  acceptedAt: new Date("2026-09-17T00:00:00.000Z"),
};

function createOrdersModule(document = orderDocument) {
  const calls = {
    orderProjection: null,
    cardProjection: null,
    cardQueries: 0,
  };
  const db = {
    collection(name) {
      if (name === "orders") {
        return {
          async findOne() {
            return document;
          },
          find(filter, options) {
            calls.orderProjection = options?.projection ?? null;
            return {
              sort() {
                return this;
              },
              async toArray() {
                return [document];
              },
            };
          },
        };
      }

      if (name === "giftCards") {
        return {
          async findOne(filter, options) {
            calls.cardQueries += 1;
            calls.cardProjection = options?.projection ?? null;
            return cardDocument;
          },
        };
      }

      throw new Error(`예상하지 않은 컬렉션: ${name}`);
    },
  };
  const orders = loadSource("lib/orders.js", {
    "@/lib/ai/gift-card": { generateGiftCard: async () => null },
    "@/lib/addresses": { getDefaultAddress: async () => null },
    "@/lib/mongodb": { getDatabase: async () => db },
    "@/lib/notifications": {
      createNotificationSafely: async () => null,
      getNotificationEventKey: (type, id) => `${type}:${id}`,
      markNotificationEventReadSafely: async () => {},
      NOTIFICATION_TYPES: {
        GIFT_RECEIVED: "GIFT_RECEIVED",
        GIFT_ADDRESS_REQUIRED: "GIFT_ADDRESS_REQUIRED",
      },
    },
    "@/lib/seller-order-filter": { getSellerOrderStatuses: (statuses) => statuses },
    "@/lib/users": {
      findUserById: async (id) => ({ id, name: id === "recipient-id" ? "받는 사람" : "보낸 사람" }),
    },
    "@/lib/utils/mongo": {
      documentIdFilter: (id) => ({ _id: String(id) }),
      foreignKeyFilter: (field, value) => ({ [field]: String(value) }),
      normalizeId: (value) => value == null ? "" : String(value),
    },
    "@/lib/wishlists": { removeProductFromRecipientWishlist: async () => {} },
  });

  return { orders, calls };
}

test("보낸 선물 목록 조회는 배송지를 DB에서 읽거나 반환하지 않는다", async () => {
  const { orders, calls } = createOrdersModule();
  const result = await orders.listSentOrders("sender-id");

  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), [
    "card",
    "createdAt",
    "id",
    "productSnapshot",
    "recipient",
    "status",
  ]);
  assert.equal("shippingAddress" in result[0], false);
  assert.equal("shippingAddress" in calls.orderProjection, false);
  assert.deepEqual(Object.keys(result[0].recipient), ["name"]);
  assert.deepEqual(Object.keys(result[0].card).sort(), ["acceptancePath", "message"]);
  assert.deepEqual(Object.keys(calls.cardProjection).sort(), ["acceptancePath", "message"]);
});

test("주문 상세는 보낸 사람에게 배송지를 제거하고 받는 사람과 판매자에게만 제공한다", async () => {
  const { orders, calls } = createOrdersModule();

  const senderOrder = await orders.getOrderDetails("order-id", "sender-id");
  assert.equal(senderOrder.shippingAddress, null);

  const recipientOrder = await orders.getOrderDetails("order-id", "recipient-id");
  assert.equal(recipientOrder.shippingAddress.address1, shippingAddress.address1);

  const sellerOrder = await orders.getOrderDetails("order-id", "seller-id");
  assert.equal(sellerOrder.shippingAddress.address1, shippingAddress.address1);

  const sellerWhoSentTheGift = createOrdersModule({
    ...orderDocument,
    sellerId: "sender-id",
  });
  const sellerSenderOrder = await sellerWhoSentTheGift.orders.getOrderDetails(
    "order-id",
    "sender-id",
  );
  assert.equal(sellerSenderOrder.shippingAddress, null);
  const sellerViewOrder = await sellerWhoSentTheGift.orders.getOrderDetails(
    "order-id",
    "sender-id",
    "seller",
  );
  assert.equal(sellerViewOrder.shippingAddress.address1, shippingAddress.address1);
  const sentViewOrder = await sellerWhoSentTheGift.orders.getOrderDetails(
    "order-id",
    "sender-id",
    "sent",
  );
  assert.equal(sentViewOrder.shippingAddress, null);

  const giftSentToSelf = createOrdersModule({
    ...orderDocument,
    recipientId: "sender-id",
  });
  const receivedSelfGift = await giftSentToSelf.orders.getOrderDetails(
    "order-id",
    "sender-id",
  );
  assert.equal(receivedSelfGift.shippingAddress.address1, shippingAddress.address1);
  const sentSelfGift = await giftSentToSelf.orders.getOrderDetails(
    "order-id",
    "sender-id",
    "sent",
  );
  assert.equal(sentSelfGift.shippingAddress, null);

  const cardQueriesBeforeUnauthorizedRequest = calls.cardQueries;
  assert.equal(await orders.getOrderDetails("order-id", "other-user-id"), null);
  assert.equal(calls.cardQueries, cardQueriesBeforeUnauthorizedRequest);
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

function getText(node) {
  if (Array.isArray(node)) return node.map(getText).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !node.props) return "";
  return getText(node.props.children);
}

function pageOrder(address, card = null) {
  return {
    id: "order-id",
    type: "single",
    senderId: "sender-id",
    recipientId: "recipient-id",
    sellerId: "seller-id",
    productSnapshot: orderDocument.productSnapshot,
    totalAmount: orderDocument.totalAmount,
    status: "preparing",
    shippingAddress: address,
    delivery: { trackingNumber: "WM-ORDER-ID" },
    card,
    groupGift: null,
    contributions: [],
    sender: { name: "보낸 사람" },
    recipient: { name: "받는 사람" },
    createdAt: orderDocument.createdAt.toISOString(),
  };
}

function loadOrderPage({ userId, address, view = "", card = null }) {
  const calls = [];
  const Page = loadSource("app/orders/[id]/page.js", {
    "next/link": "Link",
    "next/server": { connection: async () => {} },
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/components/group-gift-message-cards": "GroupGiftMessageCards",
    "@/components/icons": { GiftIcon: "GiftIcon" },
    "@/components/product-image": "ProductImage",
    "@/components/share-button": "ShareButton",
    "@/components/status-badge": "StatusBadge",
    "@/lib/orders": {
      async getOrderDetails(orderId, viewerId, orderView) {
        calls.push({ orderId, viewerId, orderView });
        return pageOrder(address, card);
      },
    },
    "@/lib/session": { requireUser: async () => ({ id: userId }) },
    "@/lib/utils/format": {
      formatDate: () => "2026년 9월 17일",
      formatWon: (amount) => `${amount}원`,
      getOrderStatusLabel: () => "상품 준비 중",
    },
  }).default;

  return { Page, calls };
}

test("혼자 선물 축하 카드는 메시지와 보낸 사람을 중심으로 표시한다", async () => {
  const card = {
    message: "늘 행복하고 건강하길 바라!",
    theme: "warm-confetti",
  };
  const recipient = loadOrderPage({
    userId: "recipient-id",
    address: shippingAddress,
    card,
  });
  const tree = await recipient.Page({
    params: Promise.resolve({ id: "order-id" }),
    searchParams: Promise.resolve({}),
  });
  const giftCard = findElements(
    tree,
    (node) => String(node.props.className ?? "").startsWith("gift-card "),
  )[0];
  const intro = findElements(
    giftCard,
    (node) => node.props.className === "gift-card-intro",
  )[0];
  const message = findElements(giftCard, (node) => node.type === "blockquote")[0];
  const sender = findElements(
    giftCard,
    (node) => node.props.className === "gift-card-sender",
  )[0];

  assert.equal(getText(intro), "받는 사람님에게 선물이 도착했어요");
  assert.equal(getText(message), "늘 행복하고 건강하길 바라!");
  assert.equal(
    findElements(sender, (node) => node.type === "strong")[0].props.children,
    "보낸 사람",
  );
});

test("보낸 선물 상세 화면은 사용자 ID로 정리된 주문을 조회하고 배송지 카드를 렌더링하지 않는다", async () => {
  const sender = loadOrderPage({ userId: "sender-id", address: null });
  const senderTree = await sender.Page({
    params: Promise.resolve({ id: "order-id" }),
    searchParams: Promise.resolve({ view: "sent" }),
  });

  assert.deepEqual(sender.calls, [{
    orderId: "order-id",
    viewerId: "sender-id",
    orderView: "sent",
  }]);
  assert.equal(
    findElements(senderTree, (node) => node.props.className === "info-card address-summary").length,
    0,
  );

  const recipient = loadOrderPage({ userId: "recipient-id", address: shippingAddress });
  const recipientTree = await recipient.Page({
    params: Promise.resolve({ id: "order-id" }),
    searchParams: Promise.resolve({}),
  });
  assert.equal(
    findElements(recipientTree, (node) => node.props.className === "info-card address-summary").length,
    1,
  );
});

test("마이페이지의 보낸 선물 상세 링크는 발신자 관점을 유지한다", async () => {
  const Page = loadSource("app/mypage/gifts/page.js", {
    "next/link": "Link",
    "next/server": { connection: async () => {} },
    "@/components/empty-state": "EmptyState",
    "@/components/product-image": "ProductImage",
    "@/components/share-button": "ShareButton",
    "@/components/status-badge": "StatusBadge",
    "@/lib/orders": {
      listReceivedOrders: async () => [],
      listSentOrders: async () => [{
        id: "order-id",
        productSnapshot: orderDocument.productSnapshot,
        status: "preparing",
        createdAt: orderDocument.createdAt.toISOString(),
        card: null,
        recipient: { name: "받는 사람" },
      }],
    },
    "@/lib/session": { requireUser: async () => ({ id: "sender-id" }) },
    "@/lib/utils/format": {
      formatDate: () => "2026년 9월 17일",
      getOrderStatusLabel: () => "상품 준비 중",
    },
  }).default;
  const tree = await Page();
  const sentGiftList = findElements(
    tree,
    (node) => typeof node.type === "function" && node.type.name === "SentGiftList",
  )[0];
  const sentGiftListTree = sentGiftList.type(sentGiftList.props);
  const sentDetailLink = findElements(
    sentGiftListTree,
    (node) => node.props.href === "/orders/order-id?view=sent",
  )[0];

  assert.equal(sentDetailLink.props.href, "/orders/order-id?view=sent");
});
