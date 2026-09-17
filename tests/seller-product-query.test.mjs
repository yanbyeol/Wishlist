import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { ObjectId } from "mongodb";
import { PRODUCT_CATEGORIES, SELLER_PRODUCT_STATUS_OPTIONS } from "../lib/constants.js";
import { getSellerProductStatuses, getSellerProductsReturnPath } from "../lib/seller-product-filter.js";
import { documentIdFilter, foreignKeyFilter, normalizeId } from "../lib/utils/mongo.js";
import { formatWon } from "../lib/utils/format.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const firstSellerId = "574953480000000000000001";
const secondSellerId = "574953480000000000000002";
const element = (type, props, key) => ({ type, props, key });
const jsxRuntime = { jsx: element, jsxs: element, Fragment: "fragment" };
const styles = { filter: "filter", help: "help", feedback: "feedback", statuses: "statuses", queryButton: "queryButton" };

function loadSource(path, dependencies, globals = {}) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const sourceModule = { exports: {} };
  runInNewContext(code, {
    module: sourceModule, exports: sourceModule.exports, URLSearchParams,
    require(name) {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith("node:")) return require(name);
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

function loadQueryActions({ user = { id: firstSellerId }, listProductsBySeller = async () => [] } = {}) {
  const calls = { authentication: 0 };
  const actions = loadSource("app/seller/products/actions.js", {
    "@/lib/products": { listProductsBySeller },
    "@/lib/seller-product-filter": { getSellerProductStatuses },
    "@/lib/session": { async requireMember() { calls.authentication += 1; if (!user) throw new Error("LOGIN_REQUIRED"); return user; } },
  });
  return { actions, calls };
}

test("상품 조회 액션은 상태를 검증하고 세션의 판매자 ID만 사용한다", async () => {
  const queries = [];
  const { actions, calls } = loadQueryActions({
    listProductsBySeller: async (...args) => { queries.push(args); return [{ id: "my-product" }]; },
  });
  const result = await actions.querySellerProductsAction(["invalid", "sold_out", "sold_out", { sellerId: secondSellerId }]);
  assert.equal(result.products[0].id, "my-product");
  assert.equal(result.error, "");
  assert.equal(queries[0][0], firstSellerId);
  assert.deepEqual(Array.from(queries[0][1]), ["sold_out"]);
  assert.equal(calls.authentication, 1);
});

test("상품 조회 액션은 비로그인 접근을 차단하고 DB 오류만 정리해 반환한다", async () => {
  let queries = 0;
  const unauthenticated = loadQueryActions({ user: null, listProductsBySeller: async () => { queries += 1; } });
  await assert.rejects(unauthenticated.actions.querySellerProductsAction([]), /LOGIN_REQUIRED/);
  assert.equal(queries, 0);

  const failed = loadQueryActions({ listProductsBySeller: async () => { throw new Error("민감한 DB 오류"); } });
  const result = await failed.actions.querySellerProductsAction([]);
  assert.equal("products" in result, false);
  assert.match(result.error, /다시 조회/);
  assert.equal(result.error.includes("민감한"), false);
});

function matches(document, filter) {
  return Object.entries(filter).every(([field, condition]) => {
    if (condition && typeof condition === "object" && "$in" in condition) {
      return condition.$in.some((value) => String(value) === String(document[field]));
    }
    return String(document[field]) === String(condition);
  });
}

function loadProducts(documents) {
  const queries = [];
  const database = {
    collection(name) {
      assert.equal(name, "products");
      return {
        find(filter) {
          queries.push(filter);
          let rows = documents.filter((document) => matches(document, filter));
          const cursor = {
            sort() { rows = rows.slice().sort((first, second) => second.createdAt - first.createdAt); return cursor; },
            async toArray() { return rows; },
          };
          return cursor;
        },
      };
    },
  };
  const products = loadSource("lib/products.js", {
    "@/lib/mongodb": { getDatabase: async () => database },
    "@/lib/seller-product-filter": { getSellerProductStatuses },
    "@/lib/utils/mongo": { documentIdFilter, foreignKeyFilter, normalizeId },
  });
  return { products, queries };
}

function product(number, sellerId = firstSellerId, status = "active") {
  return {
    _id: new ObjectId(number.toString(16).padStart(24, "0")), sellerId, status,
    name: `상품 ${number}`, price: number * 1000, category: "리빙",
    quantity: status === "sold_out" ? 0 : 3, description: "테스트 상품 설명입니다.",
    imageUrl: "/images/test.jpg", createdAt: new Date(2026, 8, number), updatedAt: new Date(2026, 8, number),
  };
}

test("판매자 상품 조회는 로그인 판매자와 선택 상태를 동시에 제한한다", async () => {
  const documents = [
    product(1),
    product(2, firstSellerId, "sold_out"),
    product(3, firstSellerId, "archived"),
    product(4, secondSellerId, "sold_out"),
    product(5, new ObjectId(firstSellerId), "sold_out"),
  ];
  const { products, queries } = loadProducts(documents);
  const results = await products.listProductsBySeller(firstSellerId, ["sold_out", "invalid"]);
  assert.deepEqual(Array.from(results, (row) => row.name), ["상품 5", "상품 2"]);
  assert.deepEqual(Array.from(queries[0].status.$in), ["sold_out"]);
  assert.equal(queries[0].sellerId.$in.length, 2);
});

function loadProductActions(deleteProductOwned) {
  const calls = { revalidation: [], redirects: [] };
  const actions = loadSource("app/products/actions.js", {
    "next/cache": { revalidatePath: (path) => calls.revalidation.push(path) },
    "next/navigation": { redirect(path) { calls.redirects.push(path); throw new Error(`REDIRECT:${path}`); } },
    "@/lib/constants": { PRODUCT_CATEGORIES },
    "@/lib/seller-product-filter": { getSellerProductsReturnPath },
    "@/lib/products": { createProduct: async () => {}, deleteProductOwned, updateProductOwned: async () => {} },
    "@/lib/product-images": { deleteProductImage: async () => {}, uploadProductImage: async () => {} },
    "@/lib/session": { requireMember: async () => ({ id: firstSellerId }) },
    "@/app/products/product-image-validation": { hasSelectedProductImage: () => false, validateProductImageFile: async () => ({}) },
    "@/lib/utils/validation": { isValidImageUrl: () => true, parseNonNegativeInteger: () => 0, parsePositiveInteger: () => 1 },
  }, { FormData, process: { env: { NODE_ENV: "test" } }, console });
  return { actions, calls };
}

test("상품 삭제 후 알림과 선택한 필터를 함께 유지한다", async () => {
  const { actions, calls } = loadProductActions(async () => ({ deleted: true, archived: true }));
  const formData = new FormData();
  formData.set("productId", "product-id");
  formData.append("filterStatus", "sold_out");
  await assert.rejects(actions.deleteProductAction(formData), /REDIRECT:/);
  const returnUrl = new URL(calls.redirects[0], "http://localhost");
  assert.deepEqual(returnUrl.searchParams.getAll("status"), ["sold_out"]);
  assert.equal(returnUrl.searchParams.get("notice"), "archived");
  assert.ok(calls.revalidation.includes("/seller/products"));
});

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

function createBoard(initialProducts, initialSearch = "") {
  const cells = [];
  const listeners = new Map();
  const requests = [];
  const tasks = [];
  const pendingEffects = [];
  let cursor = 0;
  let tree;
  let props = { initialProducts, initialStatuses: ["active", "sold_out", "archived"], initialNotice: "" };
  const window = { location: { pathname: "/seller/products", search: initialSearch, hash: "" }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  function Link() {}
  function Checkboxes() {}
  function DeleteForm() {}
  function EmptyState() {}
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!cells[index]) cells[index] = { value: initial };
      return [cells[index].value, (next) => { cells[index].value = typeof next === "function" ? next(cells[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!cells[index]) cells[index] = { current: initial };
      return cells[index];
    },
    useEffect(effect) {
      const index = cursor++;
      if (!cells[index]) {
        cells[index] = {};
        pendingEffects.push({ cell: cells[index], effect });
      }
    },
    startTransition(action) { tasks.push(Promise.resolve(action())); },
  };
  const Board = loadSource("app/seller/products/seller-product-board.js", {
    react, "react/jsx-runtime": jsxRuntime, "next/link": Link,
    "./delete-product-form": DeleteForm,
    "./actions": { querySellerProductsAction: (statuses) => new Promise((resolve, reject) => requests.push({ statuses: Array.from(statuses), resolve, reject })) },
    "@/components/empty-state": EmptyState, "@/components/product-image": () => {}, "@/components/status-badge": () => {},
    "@/lib/constants": { SELLER_PRODUCT_STATUS_OPTIONS }, "@/lib/seller-product-filter": { getSellerProductStatuses },
    "@/lib/utils/format": { formatWon }, "./product-status-checkboxes": Checkboxes, "../seller-filter.module.css": styles,
  }, { window }).default;

  function render(nextProps = props) {
    props = nextProps;
    cursor = 0;
    tree = Board(props);
    const form = findElements(tree, (node) => node.type === "form" && node.props.method === "get")[0];
    form.props.ref.current = { requestSubmit: () => form.props.onSubmit({ preventDefault() {} }) };
    for (const pendingEffect of pendingEffects.splice(0)) {
      pendingEffect.cell.cleanup = pendingEffect.effect();
    }
    return tree;
  }

  render();
  return {
    window, requests, tasks, render,
    submit(search) { window.location.search = search; findElements(tree, (node) => node.type === "form" && node.props.method === "get")[0].props.onSubmit({ preventDefault() {} }); render(); },
    pop(search) { window.location.search = search; listeners.get("popstate")(); render(); },
    selected: () => findElements(tree, (node) => node.type === Checkboxes)[0].props.selectedStatuses,
    deleteFilters: () => findElements(tree, (node) => node.type === DeleteForm)[0]?.props.filterStatuses ?? [],
    previewLink: () => findElements(tree, (node) => node.type === Link && node.props.children === "미리보기")[0]?.props,
    cards: () => findElements(tree, (node) => node.type === "article"),
    emptyState: () => findElements(tree, (node) => node.type === EmptyState)[0]?.props,
    feedback: () => findElements(tree, (node) => node.props.className?.startsWith("feedback"))[0].props.children,
    unmount: () => cells.forEach((cell) => cell.cleanup?.()),
  };
}

function displayedProduct(name = "기존 상품", status = "active") {
  return {
    id: "000000000000000000000001", status, name, price: 1000, category: "리빙",
    quantity: status === "sold_out" ? 0 : 3, imageUrl: "/images/test.jpg",
  };
}

test("상품 관리의 미리보기는 판매자 전용 경로로 이동한다", () => {
  const board = createBoard([displayedProduct()]);
  assert.equal(board.previewLink().href, "/seller/products/000000000000000000000001");
});

test("상품 부분 조회 중 기존 목록을 유지하고 오류 후에도 목록을 유지한다", async () => {
  const board = createBoard([displayedProduct()]);
  board.submit("?status=sold_out");
  assert.deepEqual(Array.from(board.selected()), ["sold_out"]);
  assert.deepEqual(Array.from(board.deleteFilters()), ["sold_out"]);
  assert.equal(board.cards().length, 1);
  assert.equal(board.feedback(), "조회 중…");
  board.requests[0].resolve({ error: "조회 실패" });
  await board.tasks[0];
  board.render();
  assert.equal(board.cards().length, 1);
  assert.equal(board.feedback(), "조회 실패");

  board.submit("?status=sold_out");
  board.requests[1].reject(new Error("통신 실패"));
  await board.tasks[1];
  board.render();
  assert.equal(board.cards().length, 1);
  assert.match(board.feedback(), /다시 조회/);
});

test("오래된 상품 조회 응답은 최신 필터 결과를 덮어쓰지 않는다", async () => {
  const board = createBoard([displayedProduct()]);
  board.submit("?status=sold_out");
  board.submit("?status=archived");
  board.submit("?status=sold_out");
  board.requests[2].resolve({ products: [displayedProduct("최신 품절 상품", "sold_out")], error: "" });
  await board.tasks[2];
  board.requests[0].resolve({ products: [], error: "" });
  board.requests[1].reject(new Error("오래된 오류"));
  await Promise.all(board.tasks);
  board.render();
  assert.equal(findElements(board.cards()[0], (node) => node.type === "h2")[0].props.children, "최신 품절 상품");
  assert.equal(board.feedback(), "");
});

test("뒤로 가기는 URL로 재조회하고 상품 삭제 후 새 서버 목록을 우선한다", async () => {
  const board = createBoard([displayedProduct()]);
  board.pop("?status=active");
  assert.deepEqual(board.requests[0].statuses, ["active"]);
  board.requests[0].resolve({ products: [displayedProduct()], error: "" });
  await board.tasks[0];
  board.render({ initialProducts: [], initialStatuses: ["active"], initialNotice: "deleted" });
  assert.equal(board.cards().length, 0);
  assert.deepEqual(Array.from(board.selected()), ["active"]);

  board.submit("?status=sold_out");
  board.unmount();
  board.requests[1].resolve({ products: [displayedProduct("늦은 상품", "sold_out")], error: "" });
  await board.tasks[1];
  assert.equal(board.cards().length, 0);
});

test("상품 상세에서 돌아와 보드가 다시 마운트되면 URL 필터로 목록을 복원한다", async () => {
  const board = createBoard([displayedProduct("기본 상품")], "?status=sold_out");
  assert.deepEqual(board.requests[0].statuses, ["sold_out"]);
  board.requests[0].resolve({ products: [displayedProduct("품절 상품", "sold_out")], error: "" });
  await board.tasks[0];
  board.render();
  assert.deepEqual(Array.from(board.selected()), ["sold_out"]);
  assert.equal(findElements(board.cards()[0], (node) => node.type === "h2")[0].props.children, "품절 상품");
});

test("전체 상품이 없을 때와 선택한 상태의 상품이 없을 때 문구를 구분한다", async () => {
  const allEmpty = createBoard([]);
  assert.equal(allEmpty.emptyState().title, "등록한 상품이 없어요");

  const filteredEmpty = createBoard([displayedProduct()]);
  filteredEmpty.submit("?status=sold_out");
  filteredEmpty.requests[0].resolve({ products: [], error: "" });
  await filteredEmpty.tasks[0];
  filteredEmpty.render();
  assert.equal(filteredEmpty.emptyState().title, "선택한 상태의 상품이 없어요");
});

test("상품 상태 체크박스는 마지막 해제를 막고 URL에서 오래된 알림을 제거한다", () => {
  const history = [];
  let submissions = 0;
  const Checkboxes = loadSource("app/seller/products/product-status-checkboxes.js", {
    "react/jsx-runtime": jsxRuntime, "@/lib/constants": { SELLER_PRODUCT_STATUS_OPTIONS },
    "@/lib/seller-product-filter": { getSellerProductsReturnPath }, "../seller-filter.module.css": styles,
  }, {
    window: { history: { pushState: (...args) => history.push(args) }, location: { hash: "#products" } },
    FormData: class { constructor(form) { this.form = form; } getAll() { return this.form.statuses; } },
  }).default;
  const tree = Checkboxes({ selectedStatuses: ["sold_out"] });
  const input = findElements(tree, (node) => node.type === "input" && node.props.value === "sold_out")[0];
  const form = { statuses: [], querySelector: () => null, requestSubmit: () => { submissions += 1; } };
  input.props.onChange({ currentTarget: { form } });
  assert.equal(submissions, 0);
  assert.equal(history.length, 0);

  form.statuses = ["active", "sold_out"];
  form.querySelector = () => true;
  input.props.onChange({ currentTarget: { form } });
  assert.equal(submissions, 1);
  assert.equal(history[0][2], "/seller/products?status=active&status=sold_out#products");
  assert.equal(history[0][2].includes("notice"), false);
});

test("상품 삭제 폼은 선택한 필터를 hidden input으로 전달한다", () => {
  const DeleteProductForm = loadSource("app/seller/products/delete-product-form.js", {
    "react/jsx-runtime": jsxRuntime,
    "@/app/products/actions": { deleteProductAction: () => {} },
  }, { window: { confirm: () => true } }).default;
  const tree = DeleteProductForm({ productId: "product-id", filterStatuses: ["sold_out", "archived"] });
  const filterInputs = findElements(tree, (node) => node.type === "input" && node.props.name === "filterStatus");
  assert.deepEqual(filterInputs.map((input) => input.props.value), ["sold_out", "archived"]);
});
