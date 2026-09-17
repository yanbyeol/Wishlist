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
    URLSearchParams,
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name in dependencies) return dependencies[name];
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

function groupGiftDependencies(db) {
  return {
    "@/lib/constants": { GROUP_GIFT_DURATION_DAYS: 14 },
    "@/lib/mongodb": { getDatabase: async () => db },
    "@/lib/orders": { createMockOrder: async () => null },
    "@/lib/products": { getProductById: async () => null },
    "@/lib/users": { findUserById: async () => null },
    "@/lib/wishlists": { isProductInWishlist: async () => true },
    "@/lib/utils/mongo": {
      documentIdFilter: (id) => ({ _id: String(id) }),
      foreignKeyCandidates: (values) => values.map(String),
      foreignKeyFilter: (field, value) => ({ [field]: String(value) }),
      normalizeId: (value) => value == null ? "" : String(value),
    },
  };
}

test("진행 중 공동선물 조회는 funding 상태에서 누적 금액이 0원보다 커야 한다", async () => {
  const queries = { single: null, multiple: null };
  const db = {
    collection(name) {
      assert.equal(name, "groupGifts");
      return {
        async findOne(query) {
          queries.single = query;
          return null;
        },
        find(query) {
          queries.multiple = query;
          return { toArray: async () => [] };
        },
      };
    },
  };
  const groupGifts = loadSource("lib/group-gifts.js", groupGiftDependencies(db));

  assert.equal(
    await groupGifts.findStartedGroupGiftForProduct("recipient-id", "product-id"),
    null,
  );
  assert.deepEqual(
    await groupGifts.findStartedGroupGiftsForProducts("recipient-id", ["product-id"]),
    [],
  );

  for (const query of [queries.single, queries.multiple]) {
    assert.equal(query.recipientId, "recipient-id");
    assert.equal(query.$or[0].status, "funding");
    assert.equal(query.$or[0].currentAmount.$gt, 0);
    assert.equal(
      Object.prototype.toString.call(query.$or[0].expiresAt.$gt),
      "[object Date]",
    );
    assert.deepEqual(
      Array.from(query.$or[1].status.$in),
      ["funded", "processing", "payment_failed"],
    );
  }
});

function loadOrderAction(startedGroupGift) {
  const calls = { created: [], groupGiftQueries: [], redirects: [] };
  const actions = loadSource("app/orders/actions.js", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": {
      redirect(path) {
        calls.redirects.push(path);
        throw new Error(`REDIRECT:${path}`);
      },
    },
    "@/lib/group-gifts": {
      async findStartedGroupGiftForProduct(recipientId, productId) {
        calls.groupGiftQueries.push({ recipientId, productId });
        return startedGroupGift;
      },
    },
    "@/lib/orders": {
      async createMockOrder(input) {
        calls.created.push({ ...input });
        return { id: "order-id" };
      },
    },
    "@/lib/products": {
      getProductById: async () => ({
        id: "product-id",
        status: "active",
        quantity: 2,
      }),
    },
    "@/lib/session": { requireUser: async () => ({ id: "sender-id" }) },
    "@/lib/users": {
      findUserByEmail: async () => null,
      findUserById: async () => ({ id: "recipient-id" }),
    },
    "@/lib/utils/format": {
      sanitizeCallbackPath: (value, fallback) => String(value || fallback),
    },
  });
  return { actions, calls };
}

function singleGiftForm() {
  const formData = new FormData();
  formData.set("productId", "product-id");
  formData.set("recipientId", "recipient-id");
  formData.set("message", "축하해요");
  formData.set("from", "/shared/shared-token/products/product-id");
  return formData;
}

test("최초 참여 전에는 혼자 선물 주문을 허용한다", async () => {
  const { actions, calls } = loadOrderAction(null);

  await assert.rejects(
    actions.createOrderAction({}, singleGiftForm()),
    /REDIRECT:\/orders\/order-id/,
  );
  assert.deepEqual(calls.groupGiftQueries, [{
    recipientId: "recipient-id",
    productId: "product-id",
  }]);
  assert.equal(calls.created.length, 1);
});

test("최초 참여 후에는 서버에서 혼자 선물 주문을 차단한다", async () => {
  const { actions, calls } = loadOrderAction({
    id: "gift-id",
    status: "funding",
    currentAmount: 10000,
  });
  const result = await actions.createOrderAction({}, singleGiftForm());

  assert.equal(
    result.message,
    "공동선물이 진행 중인 상품은 혼자 선물할 수 없습니다. 공동선물 페이지에서 참여해 주세요.",
  );
  assert.equal(calls.created.length, 0);
  assert.deepEqual(calls.redirects, []);
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

function loadOrderPage(startedGroupGift) {
  const calls = { groupGiftQueries: [], redirects: [] };
  const Page = loadSource("app/orders/new/page.js", {
    "next/server": { connection: async () => {} },
    "next/navigation": {
      notFound() { throw new Error("NOT_FOUND"); },
      redirect(path) {
        calls.redirects.push(path);
        throw new Error(`REDIRECT:${path}`);
      },
    },
    "@/app/orders/new/order-form": "OrderForm",
    "@/lib/group-gifts": {
      async findStartedGroupGiftForProduct(recipientId, productId) {
        calls.groupGiftQueries.push({ recipientId, productId });
        return startedGroupGift;
      },
    },
    "@/lib/products": {
      getProductById: async () => ({ id: "product-id", status: "active" }),
    },
    "@/lib/session": { requireUser: async () => ({ id: "sender-id" }) },
    "@/lib/users": { findUserById: async () => ({ id: "recipient-id" }) },
    "@/lib/utils/format": {
      sanitizeCallbackPath: (value, fallback) => String(value || fallback),
    },
  }).default;
  return { Page, calls };
}

test("주문 화면도 최초 참여 전에는 열리고 참여 후에는 공동선물로 이동한다", async () => {
  const searchParams = Promise.resolve({
    product: "product-id",
    recipient: "recipient-id",
    from: "/shared/shared-token/products/product-id",
  });
  const beforeStart = loadOrderPage(null);
  const tree = await beforeStart.Page({ searchParams });

  assert.equal(findElements(tree, (node) => node.type === "OrderForm").length, 1);
  assert.deepEqual(beforeStart.calls.groupGiftQueries, [{
    recipientId: "recipient-id",
    productId: "product-id",
  }]);

  const afterStart = loadOrderPage({ id: "gift-id" });
  await assert.rejects(
    afterStart.Page({ searchParams }),
    /REDIRECT:\/group-gifts\/gift-id/,
  );
  assert.deepEqual(afterStart.calls.redirects, ["/group-gifts/gift-id"]);
});
