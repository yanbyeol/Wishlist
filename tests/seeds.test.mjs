import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  deleteExistingSeedData,
  parseSeedOptions,
  RESET_RELATED_COLLECTIONS,
  TEST_LOGIN_PASSWORD,
} = require("../scripts/seeds.js");

test("seed 옵션은 일반 실행과 reset 실행을 구분한다", () => {
  assert.deepEqual(parseSeedOptions([]), { dryRun: false, reset: false });
  assert.deepEqual(parseSeedOptions(["--reset"]), { dryRun: false, reset: true });
  assert.deepEqual(parseSeedOptions(["--dry-run"]), { dryRun: true, reset: false });
  assert.throws(
    () => parseSeedOptions(["--dry-run", "--reset"]),
    /함께 사용할 수 없습니다/,
  );
  assert.throws(() => parseSeedOptions(["--unknown"]), /지원 옵션/);
});

test("reset은 인증 임시 데이터와 모든 seed collection을 먼저 비운다", async () => {
  const deletedCollections = [];
  const logs = [];
  const data = {
    user: [{ _id: "user-id" }],
    account: [{ _id: "account-id" }],
    products: [{ _id: "product-id" }],
  };
  const db = {
    collection(name) {
      return {
        async deleteMany(filter) {
          assert.deepEqual(filter, {});
          deletedCollections.push(name);
          return { deletedCount: 1 };
        },
      };
    },
  };

  await deleteExistingSeedData(db, data, (message) => logs.push(message));

  assert.deepEqual(
    deletedCollections,
    [...RESET_RELATED_COLLECTIONS, "products", "account", "user"],
  );
  assert.match(logs[0], /삭제 시작/);
  assert.match(logs.at(-1), /삭제 완료/);
});

test("모든 테스트 로그인 계정은 고정된 8자리 비밀번호를 사용한다", () => {
  assert.equal(TEST_LOGIN_PASSWORD, "12345678");
});
