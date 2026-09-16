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

function loadSource(path, dependencies) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
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

function findElements(tree, predicate) {
  const found = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return found;
}

function createDetailView() {
  function Link() {}
  function ProductImage() {}
  function WishlistButton() {}
  function GiftIcon() {}
  function SparkleIcon() {}
  const ProductDetailView = loadSource("components/product-detail-view.js", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "@/components/icons": { GiftIcon, SparkleIcon },
    "@/components/product-image": ProductImage,
    "@/components/wishlist-button": WishlistButton,
    "@/lib/utils/format": { formatWon: (price) => `${price}원` },
  }).default;

  return { ProductDetailView, Link, WishlistButton };
}

const product = {
  id: "product-id",
  sellerId: "seller-id",
  name: "테스트 상품",
  category: "리빙",
  price: 10000,
  quantity: 3,
  description: "상품 설명",
  imageUrl: "/images/test.jpg",
  status: "active",
};

test("판매자 미리보기에서는 구매와 위시리스트 액션을 모두 숨긴다", () => {
  const { ProductDetailView, WishlistButton } = createDetailView();
  const tree = ProductDetailView({
    product,
    seller: { id: "seller-id", name: "판매자" },
    user: { id: "seller-id" },
    showActions: false,
  });

  assert.equal(findElements(tree, (node) => node.props.className === "detail-actions").length, 0);
  assert.equal(findElements(tree, (node) => node.type === WishlistButton).length, 0);
});

test("일반 상품 상세에서는 기존 구매와 위시리스트 액션을 유지한다", () => {
  const { ProductDetailView, Link, WishlistButton } = createDetailView();
  const tree = ProductDetailView({
    product,
    seller: { id: "seller-id", name: "판매자" },
    user: { id: "buyer-id" },
    isWishlisted: true,
  });
  const actionLinks = findElements(tree, (node) => node.type === Link);

  assert.equal(findElements(tree, (node) => node.props.className === "detail-actions").length, 1);
  assert.deepEqual(Array.from(actionLinks, (link) => link.props.href), [
    "/orders/new?product=product-id",
    "/orders/new?product=product-id&mode=self",
  ]);
  assert.equal(findElements(tree, (node) => node.type === WishlistButton).length, 1);
});

function loadPreviewPage({ loadedProduct = product, user = { id: "seller-id", name: "판매자" } } = {}) {
  const calls = { connections: 0, callbackPaths: [], productIds: [] };
  function ProductDetailView() {}
  const page = loadSource("app/seller/products/[id]/page.js", {
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "next/server": { async connection() { calls.connections += 1; } },
    "@/components/product-detail-view": ProductDetailView,
    "@/lib/products": { async getProductById(id) { calls.productIds.push(id); return loadedProduct; } },
    "@/lib/session": { async requireUser(path) { calls.callbackPaths.push(path); return user; } },
  });
  return { Page: page.default, ProductDetailView, calls };
}

test("판매자 미리보기 페이지는 소유 상품만 액션 없이 표시한다", async () => {
  const { Page, ProductDetailView, calls } = loadPreviewPage();
  const tree = await Page({ params: Promise.resolve({ id: "product-id" }) });

  assert.equal(tree.type, ProductDetailView);
  assert.equal(tree.props.product, product);
  assert.equal(tree.props.seller.id, "seller-id");
  assert.equal(tree.props.showActions, false);
  assert.equal(calls.connections, 1);
  assert.deepEqual(calls.callbackPaths, ["/seller/products/product-id"]);
  assert.deepEqual(calls.productIds, ["product-id"]);
});

test("다른 판매자의 상품과 판매 종료 상품은 미리보기를 차단한다", async () => {
  const otherSeller = loadPreviewPage({ loadedProduct: { ...product, sellerId: "other-seller" } });
  await assert.rejects(otherSeller.Page({ params: Promise.resolve({ id: "product-id" }) }), /NOT_FOUND/);

  const archived = loadPreviewPage({ loadedProduct: { ...product, status: "archived" } });
  await assert.rejects(archived.Page({ params: Promise.resolve({ id: "product-id" }) }), /NOT_FOUND/);
});
