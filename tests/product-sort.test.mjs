import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { ObjectId } from "mongodb";
import { getSellerProductStatuses } from "../lib/seller-product-filter.js";
import {
  documentIdFilter,
  foreignKeyFilter,
  normalizeId,
} from "../lib/utils/mongo.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");

function loadSource(path, dependencies) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: {
      parser: { syntax: "ecmascript" },
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

function product(number, { price = 1000, createdAt = new Date("2026-09-15T00:00:00.000Z") } = {}) {
  return {
    _id: new ObjectId(number.toString(16).padStart(24, "0")),
    sellerId: "seller-id",
    name: `상품 ${number}`,
    price,
    category: "리빙",
    quantity: 3,
    description: "테스트 상품 설명입니다.",
    imageUrl: "/images/test.jpg",
    status: "active",
    createdAt,
    updatedAt: createdAt,
  };
}

function loadProducts(documents) {
  const sortCalls = [];
  const database = {
    collection(name) {
      assert.equal(name, "products");
      return {
        find() {
          const cursor = {
            sort(fields) {
              sortCalls.push({ ...fields });
              return cursor;
            },
            async toArray() {
              return documents.slice();
            },
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

  return { products, sortCalls };
}

test("기본 정렬은 생성시각과 상품 ID 오름차순으로 시드 작성 순서를 유지한다", async () => {
  const documents = [product(1), product(2), product(3)];
  const { products, sortCalls } = loadProducts(documents);

  await products.listProducts({ sort: "default" });
  await products.listProducts({ sort: "newest" });
  await products.listProducts({ sort: "price_asc" });
  await products.listProducts({ sort: "price_desc" });
  await products.listProductsBySeller("seller-id", ["active"]);

  assert.deepEqual(sortCalls, [
    { createdAt: 1, _id: 1 },
    { createdAt: -1, _id: -1 },
    { price: 1, createdAt: -1, _id: -1 },
    { price: -1, createdAt: -1, _id: -1 },
    { createdAt: -1, _id: -1 },
  ]);
});
