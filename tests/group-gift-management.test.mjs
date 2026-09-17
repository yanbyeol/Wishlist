import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");

function loadSource(path, dependencies) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      target: "es2022",
    },
    module: { type: "commonjs" },
  });
  const sourceModule = { exports: {} };
  runInNewContext(code, {
    module: sourceModule,
    exports: sourceModule.exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
  });
  return sourceModule.exports;
}

function createGroupGiftDatabase(groupGift, { otherPaidContribution = null } = {}) {
  let document = { ...groupGift };
  const calls = {
    updates: [],
    findOneAndUpdates: [],
    contributionFinds: 0,
    contributionFindOnes: [],
  };

  return {
    calls,
    get document() {
      return document;
    },
    db: {
      collection(name) {
        if (name === "groupGifts") {
          return {
            async findOne() {
              return { ...document };
            },
            async updateOne(filter, update) {
              calls.updates.push({ filter, update });
              document = { ...document, ...update.$set };
              return { matchedCount: 1, modifiedCount: 1 };
            },
            async findOneAndUpdate(filter, update) {
              calls.findOneAndUpdates.push({ filter, update });
              document = { ...document, ...update.$set };
              return { ...document };
            },
          };
        }

        if (name === "contributions") {
          return {
            async findOne(query) {
              calls.contributionFindOnes.push(query);
              return otherPaidContribution;
            },
            find() {
              calls.contributionFinds += 1;
              return {
                sort() {
                  return { toArray: async () => [] };
                },
                toArray: async () => [],
              };
            },
          };
        }

        throw new Error(`예상하지 못한 컬렉션: ${name}`);
      },
    },
  };
}

function loadGroupGiftFunctions(database) {
  return loadSource("lib/group-gifts.js", {
    mongodb: { ObjectId: class ObjectId {} },
    "@/lib/mongodb": { getDatabase: async () => database },
    "@/lib/notifications": {
      createNotificationSafely: async () => null,
      getNotificationEventKey: (type, id) => `${type}:${id}`,
      NOTIFICATION_TYPES: {},
    },
    "@/lib/orders": { createMockOrder: async () => ({ id: "order-id" }) },
    "@/lib/products": {
      getProductById: async (id) => ({ id, name: "테스트 상품" }),
    },
    "@/lib/users": {
      findUserById: async (id) => ({ id, name: id }),
    },
    "@/lib/wishlists": { isProductInWishlist: async () => true },
    "@/lib/utils/group-gift": {
      getStartedGroupGiftFilter: () => ({}),
    },
    "@/lib/utils/mongo": {
      documentIdFilter: (id) => ({ _id: String(id) }),
      foreignKeyCandidates: (values) => values.map(String),
      foreignKeyFilter: (field, value) => ({ [field]: String(value) }),
      normalizeId: (value) => value == null ? "" : String(value),
    },
  });
}

function groupGift(overrides = {}) {
  return {
    _id: "group-gift-id",
    organizerId: "organizer-id",
    recipientId: "recipient-id",
    productId: "product-id",
    title: "테스트 공동선물",
    targetAmount: 50000,
    currentAmount: 20000,
    status: "funding",
    expiresAt: new Date(Date.now() + 3 * 86400000),
    orderId: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("모집 기간이 끝났고 목표가 미달이면 조회 시 goal_not_met으로 전환한다", async () => {
  const database = createGroupGiftDatabase(groupGift({
    expiresAt: new Date(Date.now() - 86400000),
  }));
  const { getGroupGiftById } = loadGroupGiftFunctions(database.db);

  const result = await getGroupGiftById("group-gift-id");

  assert.equal(result.status, "goal_not_met");
  assert.equal(database.document.status, "goal_not_met");
  assert.equal(database.calls.updates.length, 1);
  assert.equal(database.calls.updates[0].update.$set.status, "goal_not_met");
});

test("모집 기간 종료 시 목표가 달성되어 있으면 기존 완료 처리를 실행한다", async () => {
  const database = createGroupGiftDatabase(groupGift({
    currentAmount: 50000,
    expiresAt: new Date(Date.now() - 86400000),
  }));
  const { getGroupGiftById } = loadGroupGiftFunctions(database.db);

  const result = await getGroupGiftById("group-gift-id");

  assert.equal(result.status, "completed");
  assert.equal(result.orderId, "order-id");
  assert.equal(database.document.status, "completed");
});

test("개설자는 목표 미달 공동선물의 날짜만 연장하고 참여 데이터와 목표 금액을 유지한다", async () => {
  const original = groupGift({
    status: "goal_not_met",
    expiresAt: new Date(Date.now() - 86400000),
  });
  const database = createGroupGiftDatabase(original);
  const { extendGroupGift } = loadGroupGiftFunctions(database.db);
  const nextExpiresAt = new Date(Date.now() + 7 * 86400000);

  const result = await extendGroupGift(
    "group-gift-id",
    "organizer-id",
    nextExpiresAt,
  );

  assert.equal(result.status, "funding");
  assert.equal(result.targetAmount, original.targetAmount);
  assert.equal(result.currentAmount, original.currentAmount);
  assert.equal(database.calls.contributionFinds, 0);
  assert.deepEqual(
    Object.keys(database.calls.findOneAndUpdates[0].update.$set).sort(),
    ["expiresAt", "status", "updatedAt"],
  );
  assert.equal(
    database.calls.findOneAndUpdates[0].filter.organizerId,
    "organizer-id",
  );
});

test("다른 사용자는 기간 연장과 종료를 서버 로직에서 모두 차단한다", async () => {
  const database = createGroupGiftDatabase(groupGift());
  const { cancelGroupGift, extendGroupGift } = loadGroupGiftFunctions(database.db);

  await assert.rejects(
    extendGroupGift(
      "group-gift-id",
      "other-user-id",
      new Date(Date.now() + 10 * 86400000),
    ),
    /만든 사용자만 기간을 연장/,
  );
  await assert.rejects(
    cancelGroupGift("group-gift-id", "other-user-id"),
    /만든 사용자만 모집을 종료/,
  );
  assert.equal(database.calls.findOneAndUpdates.length, 0);
});

test("완료·취소 상태는 연장할 수 없고 새 종료일은 기존 종료일보다 이후여야 한다", async () => {
  for (const status of ["funded", "completed", "cancelled"]) {
    const database = createGroupGiftDatabase(groupGift({ status }));
    const { extendGroupGift } = loadGroupGiftFunctions(database.db);
    await assert.rejects(
      extendGroupGift(
        "group-gift-id",
        "organizer-id",
        new Date(Date.now() + 10 * 86400000),
      ),
      /현재 상태에서는/,
    );
  }

  const active = groupGift();
  const database = createGroupGiftDatabase(active);
  const { extendGroupGift } = loadGroupGiftFunctions(database.db);
  await assert.rejects(
    extendGroupGift(
      "group-gift-id",
      "organizer-id",
      new Date(active.expiresAt.getTime() - 1000),
    ),
    /기존 종료일보다 이후/,
  );
});

test("개설자는 진행 중인 공동선물을 종료할 수 있다", async () => {
  const database = createGroupGiftDatabase(groupGift());
  const { cancelGroupGift } = loadGroupGiftFunctions(database.db);

  const result = await cancelGroupGift("group-gift-id", "organizer-id");

  assert.equal(result.status, "cancelled");
  assert.equal(database.calls.contributionFindOnes.length, 1);
  assert.equal(database.calls.contributionFindOnes[0].paymentStatus.$in.length, 2);
  assert.equal(database.calls.contributionFindOnes[0].paymentStatus.$in[0], "pending");
  assert.equal(database.calls.contributionFindOnes[0].paymentStatus.$in[1], "paid");
  assert.equal(database.calls.contributionFindOnes[0].userId.$nin.length, 1);
  assert.equal(database.calls.contributionFindOnes[0].userId.$nin[0], "organizer-id");
  assert.equal(
    database.calls.findOneAndUpdates[0].filter.currentAmount,
    20000,
  );
  assert.deepEqual(
    Object.keys(database.calls.findOneAndUpdates[0].update.$set).sort(),
    ["status", "updatedAt"],
  );
});

test("다른 사용자의 결제 완료 참여가 있으면 개설자도 모집을 종료할 수 없다", async () => {
  const database = createGroupGiftDatabase(groupGift(), {
    otherPaidContribution: { _id: "other-contribution-id" },
  });
  const { cancelGroupGift } = loadGroupGiftFunctions(database.db);

  await assert.rejects(
    cancelGroupGift("group-gift-id", "organizer-id"),
    /다른 참여자가 있어 모집을 종료할 수 없습니다/,
  );
  assert.equal(database.calls.findOneAndUpdates.length, 0);
  assert.equal(database.document.status, "funding");
});

test("관리 Server Action은 폼의 사용자 값이 아니라 현재 세션 사용자 ID만 사용한다", async () => {
  const calls = { extend: [], cancel: [], revalidated: [] };
  const actions = loadSource("app/group-gifts/actions.js", {
    "next/cache": {
      revalidatePath: (path) => calls.revalidated.push(path),
    },
    "next/navigation": {
      redirect(path) {
        throw new Error(`REDIRECT:${path}`);
      },
    },
    "@/lib/group-gifts": {
      async extendGroupGift(...args) {
        calls.extend.push(args);
      },
      async cancelGroupGift(...args) {
        calls.cancel.push(args);
      },
      contributeToGroupGift: async () => null,
      createGroupGift: async () => null,
      findOpenGroupGiftForProduct: async () => null,
      getGroupGiftById: async () => null,
      retryGroupGiftPayment: async () => null,
    },
    "@/lib/group-gift-otp": {
      requestGuestGroupGiftOtp: async () => null,
      verifyGuestGroupGiftOtp: async () => null,
    },
    "@/lib/products": { getProductById: async () => null },
    "@/lib/session": {
      getCurrentUser: async () => ({ id: "session-user-id" }),
      requireGiftUser: async () => ({ id: "session-user-id" }),
    },
    "@/lib/users": {
      findUserByEmail: async () => null,
      findUserById: async () => null,
    },
    "@/lib/utils/format": {
      sanitizeCallbackPath: () => "/",
    },
    "@/lib/utils/group-gift-navigation": {
      getGroupGiftPath: (id) => `/group-gifts/${id}`,
      getSharedWishlistReturnPath: () => "",
    },
    "@/lib/utils/validation": {
      isValidEmail: () => true,
      parsePositiveInteger: () => 1,
    },
    "@/lib/wishlists": { isProductInWishlist: async () => true },
  });
  const formData = new FormData();
  formData.set("endDate", new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10));
  formData.set("organizerId", "spoofed-user-id");

  await actions.extendGroupGiftAction("group-gift-id", {}, formData);
  await actions.cancelGroupGiftAction("group-gift-id", {}, formData);

  assert.equal(calls.extend[0][0], "group-gift-id");
  assert.equal(calls.extend[0][1], "session-user-id");
  assert.equal(calls.cancel[0][0], "group-gift-id");
  assert.equal(calls.cancel[0][1], "session-user-id");
  assert.equal(calls.revalidated.includes("/group-gifts/group-gift-id"), true);
});
