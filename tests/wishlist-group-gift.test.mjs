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
const openStatuses = ["funding", "funded", "processing", "payment_failed"];
const user = { id: "recipient-id", name: "받는 사람" };
const product = {
  id: "product-id",
  name: "테스트 상품",
  category: "리빙",
  price: 10000,
  quantity: 3,
  description: "상품 설명",
  imageUrl: "/images/test.jpg",
  status: "active",
};
const wishlist = {
  userId: user.id,
  owner: user,
  title: "테스트 위시리스트",
  shareToken: "shared-token",
  items: [{ product }],
};

function loadModule(path, dependencies) {
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
  });
  return sourceModule.exports;
}

function loadSource(path, dependencies) {
  return loadModule(path, dependencies).default;
}

const formatFunctions = loadModule("lib/utils/format.js", {});
const navigationFunctions = loadModule("lib/utils/group-gift-navigation.js", {
  "@/lib/utils/format": formatFunctions,
});
const groupGiftFunctions = loadModule("lib/utils/group-gift.js", {});

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

function loadProductCard() {
  return loadSource("components/product-card.js", {
    "next/link": "Link",
    "@/components/product-image": "ProductImage",
    "@/components/share-button": "ShareButton",
    "@/components/status-badge": "StatusBadge",
    "@/components/wishlist-button": "WishlistButton",
    "@/lib/utils/format": { formatWon: (price) => `${price}원` },
    "@/lib/utils/group-gift": groupGiftFunctions,
  });
}

for (const status of openStatuses) {
  test(`상품 카드의 ${status} 상태는 복사 버튼 대신 정한 문구를 표시한다`, () => {
    const ProductCard = loadProductCard();
    const tree = ProductCard({
      product,
      groupGiftStatus: status,
      groupGiftCurrentAmount: status === "funding" ? 1000 : 10000,
      detailsHref: "/group-gifts/gift-id",
    });
    const badges = findElements(tree, (node) => node.type === "StatusBadge");
    const links = findElements(tree, (node) => node.type === "Link");

    assert.equal(badges.length, 1);
    assert.equal(badges[0].props.children, status === "funding" ? "공동선물 진행중" : "목표 달성");
    assert.equal(badges[0].props.tone, status === "funding" ? "warm" : "accent");
    assert.equal(findElements(tree, (node) => node.type === "ShareButton").length, 0);
    assert.equal(
      findElements(tree, (node) => node.type === "WishlistButton")[0].props.removalBlocked,
      true,
    );
    assert.deepEqual(links.map((link) => link.props.href), ["/group-gifts/gift-id", "/group-gifts/gift-id"]);
    assert.equal(links[0].props["aria-label"], "테스트 상품 공동선물 보기");
  });
}

test("모집 종료·완료·알 수 없는 상태와 일반 상품에는 공동선물 배지를 표시하지 않는다", () => {
  const ProductCard = loadProductCard();
  for (const status of [undefined, "", "cancelled", "completed", "unknown"]) {
    const tree = ProductCard({ product, groupGiftStatus: status });
    const links = findElements(tree, (node) => node.type === "Link");

    assert.equal(findElements(tree, (node) => node.type === "StatusBadge").length, 0);
    assert.deepEqual(links.map((link) => link.props.href), ["/products/product-id", "/products/product-id"]);
    assert.equal(links[0].props["aria-label"], "테스트 상품 상세 보기");
    assert.equal(findElements(tree, (node) => node.type === "WishlistButton").length, 1);
  }
});

test("참여 합계가 0원인 funding 상품에는 공동선물 진행중 배지를 표시하지 않는다", () => {
  const ProductCard = loadProductCard();
  const tree = ProductCard({
    product,
    groupGiftStatus: "funding",
    groupGiftCurrentAmount: 0,
  });
  const links = findElements(tree, (node) => node.type === "Link");

  assert.equal(findElements(tree, (node) => node.type === "StatusBadge").length, 0);
  assert.equal(
    findElements(tree, (node) => node.type === "WishlistButton")[0].props.removalBlocked,
    false,
  );
  assert.deepEqual(links.map((link) => link.props.href), [
    "/products/product-id",
    "/products/product-id",
  ]);
  assert.equal(links[0].props["aria-label"], "테스트 상품 상세 보기");
});

function loadListPage(mode, loadedWishlist, groupGifts) {
  const calls = { connections: 0, groupGiftQueries: [] };
  const Page = loadSource(mode === "shared" ? "app/shared/[token]/page.js" : "app/wishlist/page.js", {
    "next/link": "Link",
    "next/server": { async connection() { calls.connections += 1; } },
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/components/empty-state": "EmptyState",
    "@/components/product-card": "ProductCard",
    "@/components/share-button": "ShareButton",
    "@/lib/group-gifts": {
      async findStartedGroupGiftsForProducts(recipientId, productIds) {
        calls.groupGiftQueries.push({ recipientId, productIds: Array.from(productIds) });
        return groupGifts;
      },
    },
    "@/lib/utils/group-gift-navigation": navigationFunctions,
    "@/lib/session": {
      async requireMember(callback) {
        assert.equal(callback, "/wishlist");
        return user;
      },
    },
    "@/lib/wishlists": {
      async getSharedWishlist(token) {
        assert.equal(token, "shared-token");
        return loadedWishlist;
      },
      async getWishlistForUser(currentUser) {
        assert.equal(currentUser, user);
        return loadedWishlist;
      },
    },
  });
  return { Page, calls };
}

for (const mode of ["shared", "own"]) {
  test(`${mode} 목록은 공동선물 상품의 이미지·이름을 해당 공동선물로 연결한다`, async () => {
    const products = openStatuses.map((status) => ({ ...product, id: `product-${status}` }));
    products.push(product);
    const groupGifts = openStatuses.map((status) => ({
      id: `gift-${status}`,
      productId: `product-${status}`,
      status,
      currentAmount: status === "funding" ? 1000 : 10000,
    }));
    const loadedWishlist = { ...wishlist, items: products.map((item) => ({ product: item })) };
    const { Page, calls } = loadListPage(mode, loadedWishlist, groupGifts);
    const tree = await Page({ params: Promise.resolve({ token: "shared-token" }) });
    const cards = findElements(tree, (node) => node.type === "ProductCard");
    const ProductCard = loadProductCard();

    assert.equal(calls.connections, 1);
    assert.deepEqual(calls.groupGiftQueries, [{ recipientId: user.id, productIds: products.map((item) => item.id) }]);
    assert.equal(cards.length, products.length);

    for (let index = 0; index < openStatuses.length; index += 1) {
      const status = openStatuses[index];
      const expectedGroupGiftPath = mode === "shared"
        ? `/group-gifts/gift-${status}?returnTo=%2Fshared%2Fshared-token`
        : `/group-gifts/gift-${status}`;
      assert.equal(cards[index].props.detailsHref, expectedGroupGiftPath);
      assert.equal(cards[index].props.groupGiftStatus, status);
      assert.equal(cards[index].props.groupGiftCurrentAmount, groupGifts[index].currentAmount);
      const cardTree = ProductCard(cards[index].props);
      const links = findElements(cardTree, (node) => node.type === "Link");
      assert.deepEqual(links.map((link) => link.props.href), [expectedGroupGiftPath, expectedGroupGiftPath]);
      assert.equal(findElements(cardTree, (node) => node.type === "ShareButton").length, 0);
      assert.equal(findElements(cardTree, (node) => node.type === "WishlistButton").length, mode === "shared" ? 0 : 1);
    }

    const normalCard = cards[cards.length - 1];
    assert.equal(normalCard.props.detailsHref, mode === "shared" ? "/shared/shared-token/products/product-id" : "/products/product-id");
    assert.equal(normalCard.props.groupGiftStatus, undefined);
    assert.equal(findElements(ProductCard(normalCard.props), (node) => node.type === "StatusBadge").length, 0);

    const shareButtons = findElements(tree, (node) => node.type === "ShareButton");
    assert.equal(shareButtons.length, mode === "shared" ? 0 : 1);
    if (mode === "own") {
      assert.equal(shareButtons[0].props.path, "/shared/shared-token");
      assert.equal(shareButtons[0].props.showCopyButton, true);
    }
  });

  test(`${mode} 목록의 빈 위시리스트 안내를 유지한다`, async () => {
    const { Page } = loadListPage(mode, { ...wishlist, items: [] }, []);
    const tree = await Page({ params: Promise.resolve({ token: "shared-token" }) });
    assert.equal(findElements(tree, (node) => node.type === "ProductCard").length, 0);
    assert.equal(findElements(tree, (node) => node.type === "EmptyState").length, 1);
  });
}

function loadSharedProductPage({ groupGift = null, loadedWishlist = wishlist, currentUser = null } = {}) {
  const calls = { connections: 0, userQueries: 0, groupGiftQueries: [] };
  const Page = loadSource("app/shared/[token]/products/[id]/page.js", {
    "next/link": "Link",
    "next/server": { async connection() { calls.connections += 1; } },
    "next/navigation": {
      notFound() { throw new Error("NOT_FOUND"); },
      redirect(path) { throw new Error(`REDIRECT:${path}`); },
    },
    "@/components/product-image": "ProductImage",
    "@/components/share-button": "ShareButton",
    "@/components/icons": { GiftIcon: "GiftIcon", SparkleIcon: "SparkleIcon" },
    "@/lib/group-gifts": {
      async findOpenGroupGiftForProduct(recipientId, productId) {
        calls.groupGiftQueries.push({ recipientId, productId });
        return groupGift;
      },
    },
    "@/lib/session": {
      async getCurrentUser() {
        calls.userQueries += 1;
        return currentUser;
      },
    },
    "@/lib/utils/group-gift-navigation": navigationFunctions,
    "@/lib/utils/group-gift": groupGiftFunctions,
    "@/lib/utils/format": { formatWon: (price) => `${price}원` },
    "@/lib/wishlists": { async getSharedWishlist() { return loadedWishlist; } },
  });
  return { Page, calls };
}

for (const status of openStatuses) {
  test(`기존 공유 상품 상세 주소의 ${status} 공동선물은 인증·상품 상세 없이 바로 연결한다`, async () => {
    for (const currentUser of [null, user, { id: "friend-id" }]) {
      const { Page, calls } = loadSharedProductPage({
        groupGift: {
          id: "gift-id",
          status,
          currentAmount: status === "funding" ? 1000 : 10000,
        },
        currentUser,
      });
      await assert.rejects(
        Page({ params: Promise.resolve({ token: "shared-token", id: product.id }) }),
        /^Error: REDIRECT:\/group-gifts\/gift-id\?returnTo=%2Fshared%2Fshared-token$/,
      );
      assert.equal(calls.connections, 1);
      assert.equal(calls.userQueries, 0);
      assert.deepEqual(calls.groupGiftQueries, [{ recipientId: user.id, productId: product.id }]);
    }
  });
}

test("참여 합계가 0원인 공동선물은 상품 상세와 혼자 선물하기를 유지한다", async () => {
  const from = encodeURIComponent("/shared/shared-token/products/product-id");
  const friendOrderPath = `/orders/new?product=product-id&recipient=recipient-id&from=${from}`;
  const selfOrderPath = `/orders/new?product=product-id&mode=self&from=${from}`;
  const existingGroupPath = "/group-gifts/gift-id?returnTo=%2Fshared%2Fshared-token";
  const groupGift = { id: "gift-id", status: "funding", currentAmount: 0 };

  for (const currentUser of [null, user, { id: "friend-id" }]) {
    const { Page, calls } = loadSharedProductPage({ groupGift, currentUser });
    const tree = await Page({
      params: Promise.resolve({ token: "shared-token", id: product.id }),
    });
    const actionLinks = findElements(
      tree,
      (node) => node.type === "Link" && node.props.className.startsWith("button"),
    );
    const expectedPaths = currentUser?.id === user.id
      ? [selfOrderPath]
      : [friendOrderPath, existingGroupPath];

    assert.deepEqual(actionLinks.map((link) => link.props.href), expectedPaths);
    assert.equal(calls.userQueries, 1);
  }
});

test("공동선물이 없는 공유 상품은 로그인 여부와 수령인에 따른 기존 선물 동작을 유지한다", async () => {
  const from = encodeURIComponent("/shared/shared-token/products/product-id");
  const friendOrderPath = `/orders/new?product=product-id&recipient=recipient-id&from=${from}`;
  const selfOrderPath = `/orders/new?product=product-id&mode=self&from=${from}`;
  const newGroupPath = `/group-gifts/new?product=product-id&recipient=recipient-id&from=${from}&returnTo=%2Fshared%2Fshared-token`;

  for (const currentUser of [null, user, { id: "friend-id" }]) {
    const { Page } = loadSharedProductPage({ currentUser });
    const tree = await Page({ params: Promise.resolve({ token: "shared-token", id: product.id }) });
    const actionLinks = findElements(tree, (node) => node.type === "Link" && node.props.className.startsWith("button"));
    const expectedPaths = currentUser?.id === user.id ? [selfOrderPath] : [friendOrderPath, newGroupPath];
    assert.deepEqual(actionLinks.map((link) => link.props.href), expectedPaths);
    assert.equal(findElements(tree, (node) => node.type === "ShareButton").length, 0);
    if (currentUser?.id !== user.id) assert.equal(actionLinks[1].props.children, "함께 선물하기");
  }
});

function loadNewGroupGiftPage({
  existingGroupGift = null,
  currentUser = { id: "organizer-id", name: "개설자" },
} = {}) {
  const calls = { userQueries: 0 };
  const Page = loadSource("app/group-gifts/new/page.js", {
    "next/link": "Link",
    "next/server": { connection: async () => {} },
    "next/navigation": {
      notFound() { throw new Error("NOT_FOUND"); },
      redirect(path) { throw new Error(`REDIRECT:${path}`); },
    },
    "@/app/group-gifts/group-gift-forms": { CreateGroupGiftForm: "CreateGroupGiftForm" },
    "@/components/gift-email-auth-form": "GiftEmailAuthForm",
    "@/components/product-image": "ProductImage",
    "@/lib/constants": { GROUP_GIFT_DURATION_DAYS: 14 },
    "@/lib/group-gifts": {
      findOpenGroupGiftForProduct: async () => existingGroupGift,
    },
    "@/lib/products": { getProductById: async () => product },
    "@/lib/session": {
      async getCurrentUser() {
        calls.userQueries += 1;
        return currentUser;
      },
    },
    "@/lib/users": { findUserById: async () => user },
    "@/lib/utils/format": formatFunctions,
    "@/lib/utils/group-gift-navigation": navigationFunctions,
    "@/lib/wishlists": { isProductInWishlist: async () => true },
  });
  return { Page, calls };
}

test("공유 상품에서 공동선물을 만드는 동안 생성 폼의 복귀 경로를 유지한다", async () => {
  const { Page, calls } = loadNewGroupGiftPage();
  const tree = await Page({
    searchParams: Promise.resolve({
      product: "product-id",
      recipient: "recipient-id",
      from: "/shared/shared-token/products/product-id",
      returnTo: "/shared/shared-token",
    }),
  });
  const form = findElements(tree, (node) => node.type === "CreateGroupGiftForm")[0];

  assert.equal(calls.userQueries, 1);
  assert.equal(form.props.from, "/shared/shared-token/products/product-id");
  assert.equal(form.props.returnTo, "/shared/shared-token");
  assert.equal(form.props.defaultNickname, "개설자");
  assert.match(form.props.minimumEndDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(form.props.defaultEndDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("비로그인 공동선물 개설자는 생성 화면 안에서만 이메일 인증한다", async () => {
  const { Page } = loadNewGroupGiftPage({ currentUser: null });
  const tree = await Page({
    searchParams: Promise.resolve({
      product: "product-id",
      recipient: "recipient-id",
      from: "/shared/shared-token/products/product-id",
      returnTo: "/shared/shared-token",
    }),
  });
  const authForm = findElements(tree, (node) => node.type === "GiftEmailAuthForm")[0];

  assert.equal(
    authForm.props.callback,
    "/group-gifts/new?product=product-id&recipient=recipient-id&from=%2Fshared%2Fshared-token%2Fproducts%2Fproduct-id&returnTo=%2Fshared%2Fshared-token",
  );
  assert.equal(findElements(tree, (node) => node.type === "CreateGroupGiftForm").length, 0);
});

test("생성 화면에서 기존 공동선물을 발견해도 공유 위시리스트 복귀 경로를 유지한다", async () => {
  const { Page } = loadNewGroupGiftPage({ existingGroupGift: { id: "gift-id" } });
  await assert.rejects(
    Page({
      searchParams: Promise.resolve({
        product: "product-id",
        recipient: "recipient-id",
        returnTo: "/shared/shared-token",
      }),
    }),
    /^Error: REDIRECT:\/group-gifts\/gift-id\?returnTo=%2Fshared%2Fshared-token$/,
  );
});

test("공동선물이 없는 품절 상품의 구매 차단을 유지한다", async () => {
  const loadedWishlist = { ...wishlist, items: [{ product: { ...product, quantity: 0, status: "sold_out" } }] };
  const { Page } = loadSharedProductPage({ loadedWishlist });
  const tree = await Page({ params: Promise.resolve({ token: "shared-token", id: product.id }) });
  const buttons = findElements(tree, (node) => node.type === "button" && node.props.disabled);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.children, "현재 품절된 상품입니다");
  assert.equal(findElements(tree, (node) => node.type === "Link" && node.props.className.startsWith("button")).length, 0);
});

test("유효하지 않은 공유 목록과 목록에 없는 상품은 공동선물 조회 전에 차단한다", async () => {
  const { Page: SharedPage, calls: sharedCalls } = loadListPage("shared", null, []);
  await assert.rejects(SharedPage({ params: Promise.resolve({ token: "shared-token" }) }), /NOT_FOUND/);
  assert.equal(sharedCalls.groupGiftQueries.length, 0);

  for (const loadedWishlist of [null, { ...wishlist, items: [] }]) {
    const { Page, calls } = loadSharedProductPage({ loadedWishlist });
    await assert.rejects(Page({ params: Promise.resolve({ token: "shared-token", id: product.id }) }), /NOT_FOUND/);
    assert.equal(calls.groupGiftQueries.length, 0);
    assert.equal(calls.userQueries, 0);
  }
});
