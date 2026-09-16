import test, { afterEach, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, ObjectId } from "mongodb";
import { getSellerDashboard } from "../lib/seller-dashboard.js";
import { foreignKeyFilter } from "../lib/utils/mongo.js";

const firstSellerId = "574953480000000000000001";
const secondSellerId = "574953480000000000000002";
let database;
let previousUri;
let previousDatabaseName;

beforeEach(() => {
  previousUri = process.env.MONGODB_URI;
  previousDatabaseName = process.env.MONGODB_DB;
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB = "seller-dashboard-unit-tests";
  mock.method(MongoClient.prototype, "connect", async function () { return this; });
  mock.method(MongoClient.prototype, "db", () => database);
});

afterEach(() => {
  mock.restoreAll();
  if (previousUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = previousUri;
  if (previousDatabaseName === undefined) delete process.env.MONGODB_DB;
  else process.env.MONGODB_DB = previousDatabaseName;
});

function matchesFilter(document, filter) {
  return Object.entries(filter).every(([field, condition]) => {
    if (condition && typeof condition === "object" && "$in" in condition) {
      return condition.$in.some((candidate) => String(candidate) === String(document[field]));
    }
    return document[field] === condition;
  });
}

function projectDocument(document, projection) {
  const result = {};
  for (const field of Object.keys(projection)) {
    const [parent, child] = field.split(".");
    if (child) {
      result[parent] = { ...result[parent], [child]: document[parent]?.[child] };
    } else if (field in document) {
      result[field] = document[field];
    }
  }
  return result;
}

// 읽기 메서드만 제공하므로 집계 과정에 쓰기 작업이 추가되면 테스트가 실패합니다.
function createDatabase(documents) {
  const calls = [];
  return {
    calls,
    collection(name) {
      assert.ok(name === "products" || name === "orders");
      return {
        aggregate(pipeline) {
          calls.push({ name, method: "aggregate", filter: pipeline[0].$match });
          const counts = new Map();
          for (const document of documents[name].filter((item) => matchesFilter(item, pipeline[0].$match))) {
            counts.set(document.status, (counts.get(document.status) ?? 0) + 1);
          }
          return { toArray: async () => Array.from(counts, ([_id, count]) => ({ _id, count })) };
        },
        find(filter, options) {
          const call = { name, method: "find", filter, projection: options.projection };
          calls.push(call);
          let results = documents[name].filter((item) => matchesFilter(item, filter));
          const cursor = {
            sort(order) {
              results = [...results].sort((first, second) => {
                for (const [field, direction] of Object.entries(order)) {
                  const firstValue = field === "_id" ? String(first[field]) : first[field];
                  const secondValue = field === "_id" ? String(second[field]) : second[field];
                  if (firstValue > secondValue) return direction;
                  if (firstValue < secondValue) return -direction;
                }
                return 0;
              });
              return cursor;
            },
            limit(amount) { call.limit = amount; results = results.slice(0, amount); return cursor; },
            toArray: async () => results.map((document) => projectDocument(document, options.projection)),
          };
          return cursor;
        },
      };
    },
  };
}

function product(number, sellerId, status) {
  return {
    _id: new ObjectId(number.toString(16).padStart(24, "0")),
    sellerId,
    status,
    name: `상품 ${number}`,
    quantity: status === "sold_out" ? 0 : 3,
    imageUrl: "/images/products/fallback.jpg",
    updatedAt: new Date(2026, 8, number),
  };
}

function order(number, sellerId, status) {
  return {
    _id: new ObjectId(number.toString(16).padStart(24, "0")),
    sellerId,
    status,
    productSnapshot: { name: `주문 상품 ${number}`, price: 1000 },
    totalAmount: 1000,
    createdAt: new Date(2026, 8, number),
    shippingAddress: { phone: "개인정보", address1: "개인정보" },
    senderId: "주문자 ID",
    paymentId: "결제 ID",
  };
}

test("모든 집계와 목록을 본인 sellerId로 제한하고 최대 5건을 최신순으로 조회한다", async () => {
  const products = [product(1, firstSellerId, "active"), product(2, new ObjectId(firstSellerId), "active")];
  const orders = [];
  for (let number = 3; number <= 9; number += 1) {
    products.push(product(number, firstSellerId, "sold_out"));
    orders.push(order(number, firstSellerId, number === 3 ? "awaiting_address" : number === 4 ? "shipped" : "preparing"));
  }
  products.push(product(10, firstSellerId, "archived"), product(11, secondSellerId, "active"), product(12, secondSellerId, "sold_out"));
  orders.push(order(20, secondSellerId, "preparing"));
  database = createDatabase({ products, orders });

  const result = await getSellerDashboard(firstSellerId);
  assert.deepEqual(result.counts, { activeProducts: 2, soldOutProducts: 7, awaitingAddressOrders: 1, preparingOrders: 5, shippedOrders: 1 });
  assert.equal(result.totalProducts, 10);
  assert.equal(result.recentOrders.length, 5);
  assert.equal(result.soldOutProducts.length, 5);
  assert.deepEqual(result.recentOrders.map((item) => String(item._id)), orders.slice(2, 7).reverse().map((item) => String(item._id)));
  assert.equal(result.soldOutProducts[0].name, "상품 9");
  assert.equal(database.calls.length, 4);
  for (const call of database.calls) {
    assert.deepEqual(call.filter.sellerId, foreignKeyFilter("sellerId", firstSellerId).sellerId);
    if (call.method === "find") assert.equal(call.limit, 5);
  }
});

test("판매 홈 목록에 필요한 필드만 조회하고 주문 개인정보를 제외한다", async () => {
  database = createDatabase({ products: [product(1, firstSellerId, "sold_out")], orders: [order(2, firstSellerId, "shipped")] });
  const result = await getSellerDashboard(firstSellerId);
  assert.deepEqual(result.recentOrders[0].productSnapshot, { name: "주문 상품 2" });
  assert.equal("shippingAddress" in result.recentOrders[0], false);
  assert.equal("senderId" in result.recentOrders[0], false);
  assert.equal("paymentId" in result.recentOrders[0], false);
});

test("판매자별 결과가 독립적이며 데이터가 없으면 모든 수치를 0으로 반환한다", async () => {
  database = createDatabase({ products: [product(1, firstSellerId, "active")], orders: [order(2, firstSellerId, "preparing")] });
  const first = await getSellerDashboard(firstSellerId);
  const second = await getSellerDashboard(secondSellerId);
  assert.equal(first.counts.activeProducts, 1);
  assert.equal(first.counts.preparingOrders, 1);
  assert.deepEqual(second.counts, { activeProducts: 0, soldOutProducts: 0, awaitingAddressOrders: 0, preparingOrders: 0, shippedOrders: 0 });
  assert.equal(second.totalProducts, 0);
  assert.deepEqual(second.recentOrders, []);
  assert.deepEqual(second.soldOutProducts, []);
});

test("판매 종료 상품만 있어도 상품을 등록한 이력은 유지한다", async () => {
  database = createDatabase({ products: [product(1, firstSellerId, "archived")], orders: [] });
  const result = await getSellerDashboard(firstSellerId);
  assert.equal(result.totalProducts, 1);
  assert.equal(result.counts.activeProducts, 0);
  assert.equal(result.counts.soldOutProducts, 0);
});
