import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { PRODUCT_CATEGORIES } from "../lib/constants.js";
import { getProductFilters, getProductFilterPath } from "../app/product-filter.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const element = (type, props, key) => ({ type, props, key });
const jsxRuntime = { jsx: element, jsxs: element, Fragment: "fragment" };
const filterFunctions = { getProductFilters, getProductFilterPath };

// 실제 소스를 실행하고 DB·인증·브라우저만 대체합니다. 실서비스 데이터는 변경하지 않습니다.
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
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

test("공개 상품 조회 액션은 로그인 없이 조건을 재검증하고 기존 상품 조회 함수만 호출한다", async () => {
  const queries = [];
  const { queryProductsAction } = loadSource("app/product-query-actions.js", {
    "@/lib/products": { listProducts: async (filters) => { queries.push(filters); return [{ id: "public-product" }]; } },
    "./product-filter": filterFunctions,
  });
  const result = await queryProductsAction({ category: { $ne: "" }, q: "  머그  ", sort: "invalid", excludeSoldOut: "1", userId: "other-user" });
  assert.equal(result.products[0].id, "public-product");
  assert.equal(result.error, "");
  assert.deepEqual({ ...queries[0] }, { category: "", query: "머그", sort: "newest", excludeSoldOut: true });
});

test("공개 상품 조회 오류는 민감한 DB 정보 없이 재시도 안내만 반환한다", async () => {
  const { queryProductsAction } = loadSource("app/product-query-actions.js", {
    "@/lib/products": { listProducts: async () => { throw new Error("민감한 DB 접속 정보"); } },
    "./product-filter": filterFunctions,
  });
  const result = await queryProductsAction(null);
  assert.equal("products" in result, false);
  assert.match(result.error, /다시 조회/);
  assert.equal(result.error.includes("민감한"), false);
});

test("최초 메인 요청은 connection 이후 URL 조건으로 조회하고 최소 사용자 정보만 전달한다", async () => {
  const calls = [];
  function Board() {}
  const Home = loadSource("app/page.js", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": () => {},
    "next/server": { connection: async () => { calls.push("connection"); } },
    "@/app/home-product-board": Board,
    "@/app/product-filter": filterFunctions,
    "@/components/icons": {},
    "@/lib/orders": { getAddressRequiredGiftSummary: async () => null },
    "@/lib/products": { listProducts: async (filters) => { calls.push({ ...filters }); return [{ id: "product" }]; } },
    "@/lib/session": { getCurrentUser: async () => { calls.push("session"); return { id: "user", email: "private@example.com" }; } },
    "@/lib/wishlists": { getWishlistedProductIds: async (id) => { calls.push(id); return ["product"]; } },
  }).default;
  const tree = await Home({ searchParams: Promise.resolve({ category: "리빙", q: " 머그 ", sort: "price_asc", excludeSoldOut: "1" }) });
  const board = findElements(tree, (node) => node.type === Board)[0];
  assert.equal(calls[0], "connection");
  assert.deepEqual(calls[2], { category: "리빙", query: "머그", sort: "price_asc", excludeSoldOut: true });
  assert.deepEqual({ ...board.props.user }, { id: "user" });
  assert.equal(board.props.initialFilters.keyword, "머그");
  assert.deepEqual(board.props.wishlistedIds, ["product"]);
});

test("로그인 홈은 배송지 입력이 필요한 최신 선물을 하나의 중요 배너로 표시한다", async () => {
  function Board() {}
  function Link() {}
  const queriedUsers = [];
  const Home = loadSource("app/page.js", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "next/server": { connection: async () => {} },
    "@/app/home-product-board": Board,
    "@/app/product-filter": filterFunctions,
    "@/components/icons": {},
    "@/lib/orders": {
      async getAddressRequiredGiftSummary(userId) {
        queriedUsers.push(userId);
        return {
          count: 2,
          orderId: "order-id",
          productName: "테스트 선물",
          acceptancePath: "/gifts/accept/token",
        };
      },
    },
    "@/lib/products": { listProducts: async () => [] },
    "@/lib/session": { getCurrentUser: async () => ({ id: "session-user" }) },
    "@/lib/wishlists": { getWishlistedProductIds: async () => [] },
  }).default;

  const tree = await Home({ searchParams: Promise.resolve({}) });
  const banner = findElements(
    tree,
    (node) => node.props.className === "container home-alert-banner",
  )[0];
  const addressLink = findElements(
    banner,
    (node) => node.type === Link && node.props.href === "/gifts/accept/token",
  )[0];

  assert.deepEqual(queriedUsers, ["session-user"]);
  assert.ok(banner);
  assert.ok(addressLink);
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

function displayedProduct(name = "기존 상품") {
  return { id: "product", name, sellerId: "user", quantity: 3 };
}

function createBoard(initialSearch = "", options = {}) {
  const cells = [];
  const listeners = new Map();
  const requests = [];
  const tasks = [];
  const effects = [];
  const history = [];
  const controls = { category: { value: "" }, q: { value: "" }, sort: { value: "newest" }, excludeSoldOut: { checked: false } };
  const window = { location: { pathname: "/", search: initialSearch, hash: "#products" }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  window.history = { pushState(data, unused, path) { history.push(path); const url = new URL(path, "http://localhost"); window.location.search = url.search; window.location.hash = url.hash; } };
  let cursor = 0;
  let tree;
  let props = { initialProducts: [displayedProduct()], initialFilters: getProductFilters({}), user: { id: "user" }, wishlistedIds: ["product"], ...options };
  function Link() {}
  function SearchForm() {}
  function Card() {}
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
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = cells[index];
      if (!previous || dependencies.some((value, dependencyIndex) => value !== previous.dependencies[dependencyIndex])) {
        cells[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); cells[index].cleanup = effect(); });
      }
    },
    startTransition(action) { tasks.push(Promise.resolve(action())); },
  };
  const Board = loadSource("app/home-product-board.js", {
    react, "react/jsx-runtime": jsxRuntime,
    "next/link": Link,
    "@/components/product-card": Card,
    "@/lib/constants": { PRODUCT_CATEGORIES },
    "./product-search-form": SearchForm,
    "./product-filter": filterFunctions,
    "./product-query-actions": { queryProductsAction: (query) => new Promise((resolve, reject) => requests.push({ query, resolve, reject })) },
  }, {
    window,
    FormData: class {
      constructor(form) { this.form = form; }
      *[Symbol.iterator]() {
        for (const name of ["category", "q", "sort"]) yield [name, this.form.elements.namedItem(name).value];
        if (this.form.elements.namedItem("excludeSoldOut").checked) yield ["excludeSoldOut", "1"];
      }
    },
  }).default;
  const form = {
    elements: { namedItem: (name) => controls[name] },
    requestSubmit() { searchProps().onSubmit({ currentTarget: form, preventDefault() {} }); },
  };
  function searchProps() { return findElements(tree, (node) => node.type === SearchForm)[0].props; }
  function render(nextProps = props, beforeEffects) {
    const firstRender = !tree;
    props = nextProps;
    cursor = 0;
    tree = Board(props);
    const search = searchProps();
    search.formRef.current = form;
    controls.category.value = search.category;
    if (firstRender) controls.q.value = search.keyword;
    controls.sort.value = search.sort;
    controls.excludeSoldOut.checked = search.excludeSoldOut;
    beforeEffects?.();
    for (const effect of effects.splice(0)) effect();
    return tree;
  }
  render();
  return {
    window, requests, tasks, history, controls, render, searchProps,
    submit(values = {}) {
      for (const [name, value] of Object.entries(values)) {
        if (name === "excludeSoldOut") controls[name].checked = value;
        else controls[name].value = value;
      }
      form.requestSubmit(); render();
    },
    pop(search) { window.location.search = search; listeners.get("popstate")(); render(); },
    cards: () => findElements(tree, (node) => node.type === Card).map((node) => node.props),
    category: (name) => findElements(tree, (node) => node.type === Link && node.props.children === name)[0].props,
    heading: () => findElements(tree, (node) => node.type === "h2")[0].props.children,
    unmount: () => cells.forEach((cell) => cell.cleanup?.()),
  };
}

test("검색·정렬·품절 제외를 함께 부분 조회하고 조회 중과 오류 후 기존 목록을 유지한다", async () => {
  const board = createBoard();
  board.submit({ q: "  머그  ", sort: "price_asc", excludeSoldOut: true });
  assert.deepEqual({ ...board.requests[0].query }, { category: "", q: "머그", sort: "price_asc", excludeSoldOut: "1" });
  assert.equal(board.searchProps().keyword, "머그");
  assert.equal(board.searchProps().isLoading, true);
  assert.equal(board.cards()[0].product.name, "기존 상품");
  assert.equal(board.window.location.hash, "#products");
  board.requests[0].resolve({ error: "조회 실패" });
  await board.tasks[0]; board.render();
  assert.equal(board.cards()[0].product.name, "기존 상품");
  assert.equal(board.searchProps().error, "조회 실패");
  board.submit();
  board.requests[1].reject(new Error("통신 실패"));
  await board.tasks[1]; board.render();
  assert.equal(board.cards().length, 1);
  assert.match(board.searchProps().error, /다시 조회/);
  assert.equal(board.history.length, 1);
});

test("연속 검색·필터 변경에서 오래된 성공과 오류가 마지막 결과를 덮어쓰지 않는다", async () => {
  const board = createBoard();
  board.submit({ q: "머그" });
  board.submit({ q: "커피", sort: "popular" });
  board.submit({ q: "머그", excludeSoldOut: true });
  board.requests[2].resolve({ products: [displayedProduct("최신 결과")], error: "" });
  await board.tasks[2];
  board.requests[0].resolve({ products: [], error: "" });
  board.requests[1].reject(new Error("오래된 오류"));
  await Promise.all(board.tasks); board.render();
  assert.equal(board.cards()[0].product.name, "최신 결과");
  assert.equal(board.searchProps().error, "");
});

test("뒤로·앞으로 가기는 입력 중인 검색어를 URL 값으로 복원하고 새 주소 기록 없이 재조회한다", async () => {
  const board = createBoard();
  board.submit({ q: "커피", sort: "price_desc", excludeSoldOut: true });
  board.controls.q.value = "입력 중인 검색어";
  board.pop("?excludeSoldOut=1&sort=price_asc&q=머그&category=리빙");
  assert.deepEqual({ ...board.requests[1].query }, { category: "리빙", q: "머그", sort: "price_asc", excludeSoldOut: "1" });
  assert.equal(board.controls.q.value, "머그");
  assert.equal(board.searchProps().sort, "price_asc");
  assert.equal(board.history.length, 1);
  board.pop("?q=커피&sort=price_desc&excludeSoldOut=1");
  assert.equal(board.requests[2].query.q, "커피");
  assert.equal(board.history.length, 1);
  for (const request of board.requests) request.resolve({ products: [], error: "" });
  await Promise.all(board.tasks);
});

test("상품 상세에서 돌아와 보드가 다시 마운트되면 URL의 검색·정렬·품절 조건으로 복원한다", async () => {
  const board = createBoard("?q=머그&sort=popular&excludeSoldOut=1");
  assert.equal(board.requests[0].query.q, "머그");
  assert.equal(board.requests[0].query.sort, "popular");
  assert.equal(board.requests[0].query.excludeSoldOut, "1");
  board.requests[0].resolve({ products: [displayedProduct("복원된 결과")], error: "" });
  await board.tasks[0]; board.render();
  assert.equal(board.cards()[0].product.name, "복원된 결과");
});

test("카테고리 링크와 위시리스트 복귀 주소는 부분 조회 이후 최신 조건을 보존한다", async () => {
  const board = createBoard();
  board.submit({ q: "머그", sort: "price_asc", excludeSoldOut: true });
  const category = board.category("리빙");
  const url = new URL(category.href, "http://localhost");
  assert.deepEqual(getProductFilters(url.searchParams), { category: "리빙", keyword: "머그", sort: "price_asc", excludeSoldOut: true });
  assert.equal(category.prefetch, false);
  assert.equal(category.scroll, false);
  assert.equal(board.cards()[0].isWishlisted, true);
  assert.equal(board.cards()[0].isOwned, true);
  assert.equal(board.cards()[0].returnPath, "/?q=%EB%A8%B8%EA%B7%B8&sort=price_asc&excludeSoldOut=1");
  board.requests[0].resolve({ products: [], error: "" });
  await board.tasks[0];
});

test("위시리스트 갱신의 새 서버 데이터가 부분 조회보다 우선하고 이전 요청은 무시한다", async () => {
  const board = createBoard();
  board.submit({ q: "머그" });
  const newProducts = [displayedProduct("새 서버 결과")];
  board.render({ initialProducts: newProducts, initialFilters: getProductFilters({ q: "머그" }), user: { id: "user" }, wishlistedIds: [] });
  board.requests[0].resolve({ products: [displayedProduct("오래된 부분 조회")], error: "" });
  await board.tasks[0]; board.render();
  assert.equal(board.cards()[0].product.name, "새 서버 결과");
  assert.equal(board.cards()[0].isWishlisted, false);
  board.submit(); board.unmount();
  board.requests[1].resolve({ products: [], error: "" });
  await board.tasks[1];
  assert.equal(board.cards().length, 1);
});

test("카테고리 서버 데이터가 주소 변경보다 먼저 렌더되어도 새 조건을 즉시 적용한다", () => {
  const board = createBoard();
  const filters = getProductFilters({ category: "리빙", q: "머그", sort: "price_desc", excludeSoldOut: "1" });
  board.render({ initialProducts: [displayedProduct("카테고리 결과")], initialFilters: filters, user: null, wishlistedIds: [] }, () => {
    board.window.location.search = new URL(getProductFilterPath(filters), "http://localhost").search;
  });
  assert.equal(board.heading(), "리빙");
  assert.equal(board.searchProps().category, "리빙");
  assert.equal(board.searchProps().keyword, "머그");
  assert.equal(board.searchProps().sort, "price_desc");
  assert.equal(board.cards()[0].returnPath, getProductFilterPath(filters));
  assert.equal(board.requests.length, 0);
});

test("검색 폼은 정렬·품절 변경을 즉시 제출하고 검색어를 URL 값으로 동기화한다", () => {
  const cells = [];
  const effects = [];
  let cursor = 0;
  const Form = loadSource("app/product-search-form.js", {
    "react/jsx-runtime": jsxRuntime,
    react: {
      useRef(initial) { const index = cursor++; cells[index] ??= { current: initial }; return cells[index]; },
      useEffect(effect) { effects.push(effect); },
    },
  }).default;
  function render(keyword) {
    cursor = 0;
    const tree = Form({ keyword, category: "리빙", sort: "price_asc", excludeSoldOut: true, error: "" });
    const input = findElements(tree, (node) => node.type === "input" && node.props.name === "q")[0];
    input.props.ref.current ??= { value: "입력 중" };
    for (const effect of effects.splice(0)) effect();
    return { tree, input };
  }
  const first = render("머그");
  let submissions = 0;
  const form = { requestSubmit: () => { submissions += 1; } };
  const sort = findElements(first.tree, (node) => node.type === "select")[0];
  const stock = findElements(first.tree, (node) => node.type === "input" && node.props.name === "excludeSoldOut")[0];
  sort.props.onChange({ currentTarget: { form } });
  stock.props.onChange({ currentTarget: { form } });
  assert.equal(submissions, 2);
  assert.equal(sort.props.value, "price_asc");
  assert.equal(stock.props.checked, true);
  assert.equal(first.input.props.ref.current.value, "머그");
  assert.equal(render("커피").input.props.ref.current.value, "커피");
});
