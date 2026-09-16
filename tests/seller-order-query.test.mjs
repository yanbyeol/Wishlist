import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { ObjectId } from "mongodb";
import { ORDER_STATUS_OPTIONS } from "../lib/constants.js";
import { getSellerOrderStatuses, getSellerOrdersReturnPath } from "../lib/seller-order-filter.js";
import { documentIdFilter, foreignKeyFilter, normalizeId } from "../lib/utils/mongo.js";
import { formatDate, formatWon, getOrderStatusLabel } from "../lib/utils/format.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const firstSellerId = "574953480000000000000001";
const secondSellerId = "574953480000000000000002";
const element = (type, props, key) => ({ type, props, key });
const jsxRuntime = { jsx: element, jsxs: element, Fragment: "fragment" };
const styles = { filter: "filter", help: "help", feedback: "feedback", statuses: "statuses" };

// 실제 파일을 설치된 Next.js 컴파일러로 읽되 인증·DB·브라우저만 대체합니다.
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

function loadActions({ user = { id: firstSellerId }, listSellerOrders = async () => [], updateSellerOrderStatus = async () => true } = {}) {
  const calls = { authentication: 0, revalidation: [], redirects: [] };
  const actions = loadSource("app/seller/orders/actions.js", {
    "next/cache": { revalidatePath: (path) => calls.revalidation.push(path) },
    "next/navigation": { redirect(path) { calls.redirects.push(path); throw new Error(`REDIRECT:${path}`); } },
    "@/lib/constants": { ORDER_STATUS_OPTIONS },
    "@/lib/orders": { listSellerOrders, updateSellerOrderStatus },
    "@/lib/seller-order-filter": { getSellerOrderStatuses, getSellerOrdersReturnPath },
    "@/lib/session": { async requireUser() { calls.authentication += 1; if (!user) throw new Error("LOGIN_REQUIRED"); return user; } },
  }, { FormData });
  return { actions, calls };
}

test("조회 액션은 상태를 검증하고 세션의 판매자 ID만 사용하며 페이지를 갱신하지 않는다", async () => {
  const queries = [];
  const { actions, calls } = loadActions({ listSellerOrders: async (...args) => { queries.push(args); return [{ id: "my-order" }]; } });
  const result = await actions.querySellerOrdersAction(["invalid", "shipped", "shipped", { sellerId: secondSellerId }]);
  assert.equal(result.orders[0].id, "my-order");
  assert.equal(result.error, "");
  assert.equal(queries[0][0], firstSellerId);
  assert.deepEqual(Array.from(queries[0][1]), ["shipped"]);
  assert.equal(calls.authentication, 1);
  assert.deepEqual(calls.revalidation, []);
  assert.deepEqual(calls.redirects, []);
});

test("조회 액션은 비로그인 접근을 차단하고 DB 오류만 재시도 가능한 오류로 반환한다", async () => {
  let queries = 0;
  const unauthenticated = loadActions({ user: null, listSellerOrders: async () => { queries += 1; } });
  await assert.rejects(unauthenticated.actions.querySellerOrdersAction([]), /LOGIN_REQUIRED/);
  assert.equal(queries, 0);
  const failed = loadActions({ listSellerOrders: async () => { throw new Error("민감한 DB 오류"); } });
  const result = await failed.actions.querySellerOrdersAction([]);
  assert.match(result.error, /다시 조회/);
  assert.equal("orders" in result, false);
  assert.equal(result.error.includes("민감한"), false);
  assert.deepEqual(failed.calls.revalidation, []);
});

function matches(document, filter) {
  return Object.entries(filter).every(([field, condition]) => {
    if (condition && typeof condition === "object" && "$in" in condition) return condition.$in.some((value) => String(value) === String(document[field]));
    if (condition && typeof condition === "object" && "$ne" in condition) return document[field] !== condition.$ne;
    return String(document[field]) === String(condition);
  });
}

// 이 DB는 메모리 안의 배열만 다룹니다. 실제 MongoDB에 연결하지 않습니다.
function loadOrders(documents) {
  const queries = [];
  const database = {
    collection(name) {
      assert.equal(name, "orders");
      return {
        find(filter, options) {
          queries.push({ filter, options });
          let rows = documents.filter((document) => matches(document, filter));
          const cursor = {
            sort() { rows = rows.slice().sort((first, second) => second.createdAt - first.createdAt); return cursor; },
            async toArray() { return rows; },
          };
          return cursor;
        },
        async updateOne(filter, update) {
          const document = documents.find((row) => matches(row, filter));
          if (!document) return { modifiedCount: 0, matchedCount: 0 };
          Object.assign(document, update.$set);
          return { modifiedCount: 1, matchedCount: 1 };
        },
      };
    },
  };
  const orders = loadSource("lib/orders.js", {
    "@/lib/ai/gift-card": {}, "@/lib/addresses": {}, "@/lib/wishlists": {},
    "@/lib/mongodb": { getDatabase: async () => database },
    "@/lib/seller-order-filter": { getSellerOrderStatuses },
    "@/lib/utils/mongo": { documentIdFilter, foreignKeyFilter, normalizeId },
    "@/lib/users": { findUserById: async (id) => ({ id, name: `회원 ${id}`, email: `${id}@example.com`, image: "불필요한 이미지" }) },
  });
  return { orders, queries };
}

function order(number, sellerId = firstSellerId, status = "preparing") {
  return {
    _id: new ObjectId(number.toString(16).padStart(24, "0")), sellerId, status,
    productSnapshot: { name: `상품 ${number}`, price: 1000 }, totalAmount: 1000,
    createdAt: new Date(2026, 8, number), shippingAddress: { recipientName: "회원", address1: "테스트 주소" },
    senderId: "sender", recipientId: "recipient", message: "반환하지 않을 메시지", paymentId: "반환하지 않을 결제 ID",
  };
}

test("주문 조회는 판매자와 선택 상태를 동시에 제한하고 화면에 필요한 직렬화 데이터만 반환한다", async () => {
  const documents = [order(1), order(2, firstSellerId, "shipped"), order(3, secondSellerId), order(4, new ObjectId(firstSellerId))];
  const { orders, queries } = loadOrders(documents);
  const results = await orders.listSellerOrders(firstSellerId, ["preparing", "invalid"]);
  assert.deepEqual(Array.from(results, (row) => row.productSnapshot.name), ["상품 4", "상품 1"]);
  assert.deepEqual(Object.keys(results[0]).sort(), ["createdAt", "id", "productSnapshot", "recipient", "sender", "shippingAddress", "status", "totalAmount"]);
  assert.deepEqual(Object.keys(results[0].sender).sort(), ["email", "name"]);
  assert.equal(typeof results[0].createdAt, "string");
  assert.equal(queries[0].options.projection["productSnapshot.name"], 1);
  assert.deepEqual(Array.from(queries[0].filter.status.$in), ["preparing"]);
});

test("상태 저장 후 필터가 유지되고 조건 밖 주문은 제외되며 타 판매자 주문은 변경되지 않는다", async () => {
  const documents = [order(1), order(2, secondSellerId)];
  const { orders } = loadOrders(documents);
  const { actions, calls } = loadActions(orders);
  const formData = new FormData();
  formData.set("orderId", String(documents[0]._id));
  formData.set("status", "shipped");
  formData.append("filterStatus", "awaiting_address");
  formData.append("filterStatus", "preparing");
  await assert.rejects(actions.updateOrderStatusAction(formData), /REDIRECT:/);
  const returnUrl = new URL(calls.redirects[0], "http://localhost");
  assert.deepEqual(returnUrl.searchParams.getAll("status"), ["awaiting_address", "preparing"]);
  assert.equal(returnUrl.searchParams.get("notice"), "updated");
  assert.equal((await orders.listSellerOrders(firstSellerId, returnUrl.searchParams.getAll("status"))).length, 0);
  assert.equal(await orders.updateSellerOrderStatus(String(documents[1]._id), firstSellerId, "shipped"), false);
  assert.equal(documents[1].status, "preparing");
  assert.ok(calls.revalidation.includes("/seller/orders"));
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

// Hook 저장소와 브라우저 이벤트만 대체하고 실제 보드의 이벤트 함수를 실행합니다.
function createBoard(initialOrders, initialSearch = "") {
  const cells = [];
  const listeners = new Map();
  const requests = [];
  const tasks = [];
  const pendingEffects = [];
  let cursor = 0;
  let tree;
  let props = { initialOrders, initialStatuses: ["awaiting_address", "preparing"], initialNotice: "" };
  const window = { location: { pathname: "/seller/orders", search: initialSearch, hash: "" }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  function Checkboxes() {}
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
  const Board = loadSource("app/seller/orders/seller-order-board.js", {
    react, "react/jsx-runtime": jsxRuntime, "next/link": () => {},
    "./actions": {
      querySellerOrdersAction: (statuses) => new Promise((resolve, reject) => requests.push({ statuses: Array.from(statuses), resolve, reject })),
      updateOrderStatusAction: () => {},
    },
    "@/components/empty-state": () => {}, "@/components/status-badge": () => {},
    "@/lib/constants": { ORDER_STATUS_OPTIONS }, "@/lib/seller-order-filter": { getSellerOrderStatuses },
    "@/lib/utils/format": { formatDate, formatWon, getOrderStatusLabel },
    "./order-status-checkboxes": Checkboxes, "../seller-filter.module.css": styles,
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
    saveFilters: () => findElements(tree, (node) => node.type === "input" && node.props.name === "filterStatus").map((node) => node.props.value),
    cards: () => findElements(tree, (node) => node.type === "article"),
    feedback: () => findElements(tree, (node) => node.props.className?.startsWith("feedback"))[0].props.children,
    unmount: () => cells.forEach((cell) => cell.cleanup?.()),
  };
}

function displayedOrder(name = "기존 주문") {
  return { id: "000000000000000000000001", status: "preparing", createdAt: "2026-09-16T00:00:00.000Z", productSnapshot: { name }, totalAmount: 1000, shippingAddress: null };
}

test("부분 조회 중 기존 목록을 유지하고 오류·통신 실패 후에도 목록을 유지한다", async () => {
  const board = createBoard([displayedOrder()]);
  board.submit("?status=shipped");
  assert.deepEqual(Array.from(board.selected()), ["shipped"]);
  assert.deepEqual(board.saveFilters(), ["shipped"]);
  assert.equal(board.cards().length, 1);
  assert.equal(board.feedback(), "조회 중…");
  board.requests[0].resolve({ error: "조회 실패" });
  await board.tasks[0];
  board.render();
  assert.equal(board.cards().length, 1);
  assert.equal(board.feedback(), "조회 실패");
  board.submit("?status=shipped");
  board.requests[1].reject(new Error("통신 실패"));
  await board.tasks[1];
  board.render();
  assert.equal(board.cards().length, 1);
  assert.match(board.feedback(), /다시 조회/);
});

test("빠르게 조건이 원래 값으로 돌아와도 오래된 성공·실패 응답이 최신 결과를 덮어쓰지 않는다", async () => {
  const board = createBoard([displayedOrder()]);
  board.submit("?status=shipped");
  board.submit("?status=delivered");
  board.submit("?status=shipped");
  board.requests[2].resolve({ orders: [displayedOrder("최신 주문")], error: "" });
  await board.tasks[2];
  board.requests[0].resolve({ orders: [], error: "" });
  board.requests[1].reject(new Error("오래된 오류"));
  await Promise.all(board.tasks);
  board.render();
  assert.equal(board.cards().length, 1);
  assert.equal(findElements(board.cards()[0], (node) => node.type === "h2")[0].props.children, "최신 주문");
  assert.equal(board.feedback(), "");
});

test("뒤로 가기는 현재 URL로 재조회하고 저장 후 새 서버 데이터는 이전 조회 결과보다 우선한다", async () => {
  const board = createBoard([displayedOrder()]);
  board.pop("?status=preparing");
  assert.deepEqual(board.requests[0].statuses, ["preparing"]);
  assert.deepEqual(board.saveFilters(), ["preparing"]);
  board.requests[0].resolve({ orders: [displayedOrder()], error: "" });
  await board.tasks[0];
  board.render({ initialOrders: [], initialStatuses: ["preparing"], initialNotice: "updated" });
  assert.equal(board.cards().length, 0);
  assert.deepEqual(Array.from(board.selected()), ["preparing"]);
  board.submit("?status=shipped");
  board.unmount();
  board.requests[1].resolve({ orders: [displayedOrder()], error: "" });
  await board.tasks[1];
  assert.equal(board.cards().length, 0);
});

test("주문 상세에서 뒤로 돌아와 보드가 다시 마운트되면 URL 필터로 목록을 복원한다", async () => {
  const board = createBoard([displayedOrder("기본 상태 주문")], "?status=shipped");
  assert.deepEqual(board.requests[0].statuses, ["shipped"]);
  const shippedOrder = { ...displayedOrder("배송 중 주문"), status: "shipped" };
  board.requests[0].resolve({ orders: [shippedOrder], error: "" });
  await board.tasks[0];
  board.render();
  assert.deepEqual(Array.from(board.selected()), ["shipped"]);
  assert.equal(findElements(board.cards()[0], (node) => node.type === "h2")[0].props.children, "배송 중 주문");
});

test("체크박스는 마지막 선택 해제를 막고 유효한 변경만 주소 기록 후 폼에 전달한다", () => {
  const history = [];
  let submissions = 0;
  const Checkboxes = loadSource("app/seller/orders/order-status-checkboxes.js", {
    "react/jsx-runtime": jsxRuntime, "@/lib/constants": { ORDER_STATUS_OPTIONS },
    "@/lib/seller-order-filter": { getSellerOrdersReturnPath }, "../seller-filter.module.css": styles,
  }, {
    window: { history: { pushState: (...args) => history.push(args) }, location: { hash: "#orders" } },
    FormData: class { constructor(form) { this.form = form; } getAll() { return this.form.statuses; } },
  }).default;
  const tree = Checkboxes({ selectedStatuses: ["shipped"] });
  const input = findElements(tree, (node) => node.type === "input" && node.props.value === "shipped")[0];
  const form = { statuses: [], querySelector: () => null, requestSubmit: () => { submissions += 1; } };
  input.props.onChange({ currentTarget: { form } });
  assert.equal(submissions, 0);
  assert.equal(history.length, 0);
  assert.equal(input.props.checked, true);
  form.statuses = ["preparing", "shipped"];
  form.querySelector = () => true;
  input.props.onChange({ currentTarget: { form } });
  assert.equal(submissions, 1);
  assert.equal(history[0][2], "/seller/orders?status=preparing&status=shipped#orders");
});
