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
    FormData,
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name in dependencies) return dependencies[name];
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

const message = "공동선물이 진행 중인 상품은 위시리스트에서 삭제할 수 없어요.";
const groupGiftUtils = loadSource("lib/utils/group-gift.js", {});
const plain = (value) => JSON.parse(JSON.stringify(value));

function createWishlistDatabase(startedGroupGift) {
  const calls = {
    groupGiftQuery: null,
    deletedItems: 0,
  };
  const wishlist = { _id: "wishlist-id", userId: "recipient-id", title: "위시리스트" };
  const existingItem = { _id: "item-id", wishlistId: "wishlist-id", productId: "product-id" };
  const collections = {
    wishlists: {
      async createIndex() {},
      findOne: async () => wishlist,
    },
    products: {
      findOne: async () => ({ _id: "product-id", status: "active" }),
    },
    wishlistItems: {
      async createIndex() {},
      findOne: async () => existingItem,
      async deleteMany() {
        calls.deletedItems += 1;
      },
    },
    groupGifts: {
      async findOne(query) {
        calls.groupGiftQuery = query;
        return startedGroupGift;
      },
    },
  };

  return {
    calls,
    db: {
      collection(name) {
        const collection = collections[name];
        if (!collection) throw new Error(`예상하지 않은 컬렉션: ${name}`);
        return collection;
      },
    },
  };
}

function loadWishlists(db) {
  return loadSource("lib/wishlists.js", {
    "node:crypto": { randomUUID: () => "share-token" },
    "@/lib/mongodb": { getDatabase: async () => db },
    "@/lib/utils/group-gift": groupGiftUtils,
    "@/lib/utils/mongo": {
      documentIdFilter: (id) => ({ _id: String(id) }),
      foreignKeyCandidates: (values) => values.map(String),
      foreignKeyFilter: (field, value) => ({ [field]: String(value) }),
      normalizeId: (value) => value == null ? "" : String(value),
      toObjectId: (value) => value,
    },
    "@/lib/users": { findUserById: async () => null },
  });
}

test("참여금이 0원인 공동선물 상품은 위시리스트에서 삭제할 수 있다", async () => {
  const { db, calls } = createWishlistDatabase(null);
  const { setWishlistProduct } = loadWishlists(db);

  const result = await setWishlistProduct({ id: "recipient-id" }, "product-id", false);

  assert.equal(result.added, false);
  assert.equal(result.removalBlocked, false);
  assert.equal(calls.deletedItems, 1);
  assert.equal(calls.groupGiftQuery.recipientId, "recipient-id");
  assert.equal(calls.groupGiftQuery.productId, "product-id");
  assert.equal(calls.groupGiftQuery.$or[0].status, "funding");
  assert.equal(calls.groupGiftQuery.$or[0].currentAmount.$gt, 0);
});

test("최초 참여 후에는 서버 삭제 로직이 위시리스트 해제를 차단한다", async () => {
  const { db, calls } = createWishlistDatabase({
    _id: "group-gift-id",
    status: "funding",
    currentAmount: 10000,
  });
  const { setWishlistProduct } = loadWishlists(db);

  const result = await setWishlistProduct({ id: "recipient-id" }, "product-id", false);

  assert.equal(result.added, false);
  assert.equal(result.removalBlocked, true);
  assert.equal(calls.deletedItems, 0);
});

function createWishlistAddDatabase(existingItem = null) {
  const calls = {
    indexes: [],
    itemUpserts: [],
    insertedItems: 0,
  };
  let hasCanonicalItem = Boolean(existingItem);
  const wishlist = {
    _id: "wishlist-id",
    userId: "recipient-id",
    title: "위시리스트",
    shareToken: "share-token",
    visibility: "public",
  };
  const collections = {
    wishlists: {
      async createIndex(keys, options) {
        calls.indexes.push({ collection: "wishlists", keys, options });
      },
      findOne: async () => wishlist,
    },
    products: {
      findOne: async () => ({ _id: "product-id", status: "active" }),
    },
    wishlistItems: {
      async createIndex(keys, options) {
        calls.indexes.push({ collection: "wishlistItems", keys, options });
      },
      findOne: async () => existingItem,
      async updateOne(filter, update, options) {
        calls.itemUpserts.push({ filter, update, options });
        await Promise.resolve();
        if (hasCanonicalItem) {
          return { matchedCount: 1, upsertedCount: 0 };
        }
        hasCanonicalItem = true;
        calls.insertedItems += 1;
        return { matchedCount: 0, upsertedCount: 1 };
      },
    },
  };

  return {
    calls,
    db: {
      collection(name) {
        const collection = collections[name];
        if (!collection) throw new Error(`예상하지 않은 컬렉션: ${name}`);
        return collection;
      },
    },
  };
}

test("동시 위시리스트 추가는 unique index와 원자적 upsert로 한 건만 생성한다", async () => {
  const { db, calls } = createWishlistAddDatabase();
  const { setWishlistProduct } = loadWishlists(db);

  const results = await Promise.all([
    setWishlistProduct({ id: "recipient-id" }, "product-id", true),
    setWishlistProduct({ id: "recipient-id" }, "product-id", true),
  ]);

  assert.equal(calls.insertedItems, 1);
  assert.equal(calls.itemUpserts.length, 2);
  assert.deepEqual(
    results.map((result) => result.alreadyExists).sort(),
    [false, true],
  );
  assert.deepEqual(plain(calls.itemUpserts[0].filter), {
    wishlistId: "wishlist-id",
    productId: "product-id",
  });
  assert.deepEqual(plain(calls.itemUpserts[0].options), { upsert: true });
  assert.deepEqual(
    plain(calls.indexes),
    [
      {
        collection: "wishlists",
        keys: { userId: 1 },
        options: { name: "wishlists_userId_unique", unique: true },
      },
      {
        collection: "wishlistItems",
        keys: { wishlistId: 1, productId: 1 },
        options: { name: "wishlistItems_wishlistId_productId_unique", unique: true },
      },
    ],
  );
});

test("이미 담긴 상품의 add 요청은 상품을 제거하지 않고 중복 상태를 반환한다", async () => {
  const existingItem = {
    _id: "item-id",
    wishlistId: "wishlist-id",
    productId: "product-id",
  };
  const { db, calls } = createWishlistAddDatabase(existingItem);
  const { setWishlistProduct } = loadWishlists(db);

  const result = await setWishlistProduct(
    { id: "recipient-id" },
    "product-id",
    true,
  );

  assert.equal(result.added, true);
  assert.equal(result.alreadyExists, true);
  assert.equal(calls.itemUpserts.length, 0);
});

function wishlistFormData() {
  const formData = new FormData();
  formData.set("productId", "product-id");
  formData.set("intent", "remove");
  formData.set("returnPath", "/wishlist");
  return formData;
}

test("Server Action은 차단된 직접 요청을 안내하고 화면을 갱신하지 않는다", async () => {
  const revalidatedPaths = [];
  const actions = loadSource("app/wishlist/actions.js", {
    "next/cache": { revalidatePath: (path) => revalidatedPaths.push(path) },
    "@/lib/constants": { GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE: message },
    "@/lib/session": { requireUser: async () => ({ id: "recipient-id" }) },
    "@/lib/utils/format": { sanitizeCallbackPath: (value) => String(value) },
    "@/lib/wishlists": {
      setWishlistProduct: async () => ({ added: false, removalBlocked: true }),
    },
  });

  const result = await actions.toggleWishlistAction(null, wishlistFormData());

  assert.equal(result.added, false);
  assert.equal(result.removalBlocked, true);
  assert.equal(result.message, message);
  assert.deepEqual(revalidatedPaths, []);
});

test("중복 add 요청은 제거로 뒤집지 않고 자연스러운 안내를 반환한다", async () => {
  const revalidatedPaths = [];
  const calls = [];
  const actions = loadSource("app/wishlist/actions.js", {
    "next/cache": { revalidatePath: (path) => revalidatedPaths.push(path) },
    "@/lib/constants": { GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE: message },
    "@/lib/session": { requireUser: async () => ({ id: "recipient-id" }) },
    "@/lib/utils/format": { sanitizeCallbackPath: (value) => String(value) },
    "@/lib/wishlists": {
      async setWishlistProduct(currentUser, productId, shouldAdd) {
        calls.push({ currentUser, productId, shouldAdd });
        return { added: true, alreadyExists: true, removalBlocked: false };
      },
    },
  });
  const formData = wishlistFormData();
  formData.set("intent", "add");

  const result = await actions.toggleWishlistAction(null, formData);

  assert.equal(result.added, true);
  assert.equal(result.alreadyExists, true);
  assert.equal(result.message, "이미 위시리스트에 있는 상품입니다.");
  assert.deepEqual(calls, [{
    currentUser: { id: "recipient-id" },
    productId: "product-id",
    shouldAdd: true,
  }]);
  assert.deepEqual(revalidatedPaths, ["/wishlist", "/wishlist"]);
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

test("진행 중 상품의 해제 시도는 요청 전에 기존 snackbar 안내를 표시한다", () => {
  const values = [];
  let stateCursor = 0;
  const react = {
    useActionState: () => [null, "serverAction", false],
    useEffect: () => {},
    useState(initialValue) {
      const currentIndex = stateCursor;
      stateCursor += 1;
      if (!(currentIndex in values)) values[currentIndex] = initialValue;
      return [values[currentIndex], (nextValue) => {
        values[currentIndex] = typeof nextValue === "function"
          ? nextValue(values[currentIndex])
          : nextValue;
      }];
    },
  };
  const WishlistButton = loadSource("components/wishlist-button.js", {
    react,
    "react-dom": { createPortal: (children) => children },
    "next/link": "Link",
    "@/app/wishlist/actions": { toggleWishlistAction: async () => null },
    "@/components/icons": { HeartIcon: "HeartIcon" },
    "@/lib/constants": { GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE: message },
  }, {
    document: { body: {} },
    window: { setTimeout: () => 1, clearTimeout: () => {} },
  }).default;
  const props = {
    productId: "product-id",
    isWishlisted: true,
    removalBlocked: true,
    user: { id: "recipient-id" },
    returnPath: "/wishlist",
    compact: true,
  };

  stateCursor = 0;
  const initialTree = WishlistButton(props);
  const form = findElements(initialTree, (node) => node.type === "form")[0];
  const intent = findElements(
    initialTree,
    (node) => node.type === "input" && node.props.name === "intent",
  )[0];
  let prevented = false;
  form.props.onSubmit({ preventDefault() { prevented = true; } });

  stateCursor = 0;
  const updatedTree = WishlistButton(props);
  const feedback = findElements(
    updatedTree,
    (node) => node.props.className === "wishlist-feedback",
  )[0];

  assert.equal(prevented, true);
  assert.equal(intent.props.value, "remove");
  assert.equal(feedback.props.role, "status");
  assert.equal(feedback.props.children[0].props.children, message);
});
