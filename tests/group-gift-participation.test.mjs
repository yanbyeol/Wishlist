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
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name in dependencies) return dependencies[name];
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

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

function findText(tree, text) {
  let found = false;
  function visit(node) {
    if (found) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === text) {
      found = true;
      return;
    }
    if (node && typeof node === "object" && node.props) visit(node.props.children);
  }
  visit(tree);
  return found;
}

test("기존 참여 여부는 회원 ID 또는 인증 이메일과 paid 상태로만 조회한다", async () => {
  const queries = [];
  const db = {
    collection(name) {
      assert.equal(name, "contributions");
      return {
        async findOne(query) {
          queries.push({ ...query });
          return { _id: "paid-contribution" };
        },
      };
    },
  };
  const { hasGroupGiftContribution } = loadSource("lib/group-gifts.js", {
    "@/lib/constants": { GROUP_GIFT_DURATION_DAYS: 14 },
    "@/lib/mongodb": { getDatabase: async () => db },
    "@/lib/orders": { createMockOrder: async () => null },
    "@/lib/products": { getProductById: async () => null },
    "@/lib/users": { findUserById: async () => null },
    "@/lib/utils/mongo": {
      documentIdFilter: (id) => ({ _id: String(id) }),
      foreignKeyCandidates: (values) => values,
      foreignKeyFilter: (field, value) => ({ [field]: String(value) }),
      normalizeId: (value) => value == null ? "" : String(value),
    },
  });

  assert.equal(await hasGroupGiftContribution({
    groupGiftId: "gift-id",
    userId: "member-id",
    guestEmail: "ignored@example.com",
  }), true);
  assert.deepEqual(queries[0], {
    groupGiftId: "gift-id",
    userId: "member-id",
    paymentStatus: "paid",
  });

  assert.equal(await hasGroupGiftContribution({
    groupGiftId: "gift-id",
    guestEmail: "  FRIEND@EXAMPLE.COM ",
  }), true);
  assert.deepEqual(queries[1], {
    groupGiftId: "gift-id",
    guestEmail: "friend@example.com",
    paymentStatus: "paid",
  });

  assert.equal(await hasGroupGiftContribution({ groupGiftId: "gift-id" }), false);
  assert.equal(queries.length, 2);
});

function groupGift(status = "funding") {
  return {
    id: "gift-id",
    organizerId: "organizer-id",
    recipientId: "recipient-id",
    title: "테스트 공동선물",
    targetAmount: 50000,
    currentAmount: 10000,
    status,
    expiresAt: new Date("2026-09-30T00:00:00.000Z").toISOString(),
    orderId: status === "completed" ? "order-id" : null,
    product: {
      id: "product-id",
      name: "테스트 상품",
      category: "리빙",
      imageUrl: "/images/test.jpg",
    },
    organizer: { name: "개설자" },
    recipient: { name: "수령인" },
    contributions: [],
  };
}

function loadGroupGiftPage({ status = "funding", user = null, guestSession = null, hasContribution = false } = {}) {
  const contributionQueries = [];
  const sessionQueries = [];
  const Page = loadSource("app/group-gifts/[id]/page.js", {
    "next/link": "Link",
    "next/server": { connection: async () => {} },
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/app/group-gifts/group-gift-forms": {
      ContributionForm: "ContributionForm",
      GuestOtpForm: "GuestOtpForm",
      RetryGroupGiftForm: "RetryGroupGiftForm",
    },
    "@/components/product-image": "ProductImage",
    "@/components/share-button": "ShareButton",
    "@/components/status-badge": "StatusBadge",
    "@/lib/group-gift-otp": {
      async getGuestGroupGiftSession(groupGiftId) {
        sessionQueries.push(groupGiftId);
        return guestSession;
      },
    },
    "@/lib/group-gifts": {
      getGroupGiftById: async () => groupGift(status),
      async hasGroupGiftContribution(participant) {
        contributionQueries.push({ ...participant });
        return hasContribution;
      },
    },
    "@/lib/session": { getCurrentUser: async () => user },
    "@/lib/utils/format": {
      formatDate: (value) => value,
      formatWon: (value) => `${value}원`,
      getGroupGiftStatusLabel: (value) => value,
    },
  }).default;
  return { Page, contributionQueries, sessionQueries };
}

test("로그인 회원의 참여 완료 화면은 회원 ID의 DB 조회 결과를 사용한다", async () => {
  const { Page, contributionQueries, sessionQueries } = loadGroupGiftPage({
    user: { id: "member-id", name: "회원" },
    hasContribution: true,
  });
  const tree = await Page({ params: Promise.resolve({ id: "gift-id" }) });
  const contributionForm = findElements(tree, (node) => node.type === "ContributionForm")[0];

  assert.equal(sessionQueries.length, 0);
  assert.equal(contributionQueries.length, 1);
  assert.equal(contributionQueries[0].groupGiftId, "gift-id");
  assert.equal(contributionQueries[0].userId, "member-id");
  assert.equal(contributionQueries[0].guestEmail, undefined);
  assert.equal(contributionForm.props.initialHasContribution, true);
});

test("비회원은 이메일 인증 세션이 생긴 뒤에만 인증 이메일로 참여 내역을 조회한다", async () => {
  const beforeVerification = loadGroupGiftPage();
  const beforeTree = await beforeVerification.Page({ params: Promise.resolve({ id: "gift-id" }) });

  assert.equal(beforeVerification.contributionQueries.length, 0);
  assert.equal(findElements(beforeTree, (node) => node.type === "GuestOtpForm").length, 1);
  assert.equal(findElements(beforeTree, (node) => node.type === "ContributionForm").length, 0);

  const afterVerification = loadGroupGiftPage({
    guestSession: { email: "friend@example.com" },
    hasContribution: true,
  });
  const afterTree = await afterVerification.Page({ params: Promise.resolve({ id: "gift-id" }) });
  const contributionForm = findElements(afterTree, (node) => node.type === "ContributionForm")[0];

  assert.equal(afterVerification.contributionQueries.length, 1);
  assert.equal(afterVerification.contributionQueries[0].userId, undefined);
  assert.equal(afterVerification.contributionQueries[0].guestEmail, "friend@example.com");
  assert.equal(contributionForm.props.initialHasContribution, true);
});

test("funding 이외 상태와 수령인에게는 참여 폼을 표시하지 않는다", async () => {
  for (const status of ["funded", "processing", "payment_failed", "completed", "cancelled"]) {
    const { Page } = loadGroupGiftPage({ status, user: { id: "member-id", name: "회원" } });
    const tree = await Page({ params: Promise.resolve({ id: "gift-id" }) });
    assert.equal(findElements(tree, (node) => node.type === "ContributionForm").length, 0);
  }

  const { Page } = loadGroupGiftPage({ user: { id: "recipient-id", name: "수령인" } });
  const tree = await Page({ params: Promise.resolve({ id: "gift-id" }) });
  assert.equal(findElements(tree, (node) => node.type === "ContributionForm").length, 0);
});

function createContributionForm(initialHasContribution, actionResults) {
  const hookCells = new Map();
  let currentHooks;
  let tree;
  let actionIndex = 0;

  function nextCell(initialValue) {
    const index = currentHooks.index;
    currentHooks.index += 1;
    if (!currentHooks.cells[index]) currentHooks.cells[index] = { value: initialValue };
    return currentHooks.cells[index];
  }

  const react = {
    useState(initialValue) {
      const cell = nextCell(initialValue);
      return [cell.value, (nextValue) => {
        cell.value = typeof nextValue === "function" ? nextValue(cell.value) : nextValue;
      }];
    },
    useActionState(action, initialValue) {
      const cell = nextCell(initialValue);
      return [cell.value, async (formData) => {
        cell.value = await action(cell.value, formData);
      }, false];
    },
  };

  const { ContributionForm } = loadSource("app/group-gifts/group-gift-forms.js", {
    react,
    "@/app/group-gifts/actions": {
      contributeGroupGiftAction: async () => actionResults[actionIndex++],
      createGroupGiftAction: async () => ({}),
      requestGroupGiftOtpAction: async () => ({}),
      retryGroupGiftPaymentAction: async () => ({}),
      verifyGroupGiftOtpAction: async () => ({}),
    },
    "@/lib/utils/format": { formatWon: (value) => `${value}원` },
  });
  const props = {
    groupGift: { id: "gift-id", targetAmount: 50000, currentAmount: 10000 },
    defaultNickname: "참여자",
    initialHasContribution,
  };

  function renderNode(node, path) {
    if (Array.isArray(node)) return node.map((child, index) => renderNode(child, `${path}.${index}`));
    if (!node || typeof node !== "object" || !node.props) return node;
    if (typeof node.type === "function") {
      const identity = `${path}:${node.type.name}:${node.key ?? ""}`;
      const previousHooks = currentHooks;
      const cells = hookCells.get(identity) ?? [];
      hookCells.set(identity, cells);
      currentHooks = { cells, index: 0 };
      const rendered = node.type(node.props);
      currentHooks = previousHooks;
      return renderNode(rendered, identity);
    }
    return {
      ...node,
      props: {
        ...node.props,
        children: renderNode(node.props.children, `${path}.children`),
      },
    };
  }

  function render() {
    currentHooks = { cells: hookCells.get("root") ?? [], index: 0 };
    hookCells.set("root", currentHooks.cells);
    tree = renderNode(ContributionForm(props), "root.output");
    currentHooks = null;
    return tree;
  }

  render();
  return {
    render,
    tree: () => tree,
    async submit() {
      const form = findElements(tree, (node) => node.type === "form")[0];
      assert.ok(form, "참여 입력 폼이 표시되어야 합니다.");
      await form.props.action(new FormData());
      render();
    },
    clickAdditional() {
      const button = findElements(
        tree,
        (node) => node.type === "button" && node.props.children === "추가 참여하기",
      )[0];
      assert.ok(button, "추가 참여 버튼이 표시되어야 합니다.");
      button.props.onClick();
      render();
    },
  };
}

test("입력 오류는 폼과 오류를 유지하고 성공은 추가 참여 안내로 전환한다", async () => {
  const form = createContributionForm(false, [
    { message: "남은 금액을 확인해 주세요." },
    { message: "", success: true },
    { message: "", success: true },
  ]);

  assert.equal(findElements(form.tree(), (node) => node.type === "form").length, 1);
  assert.equal(findText(form.tree(), "참여했습니다."), false);

  await form.submit();
  assert.equal(findElements(form.tree(), (node) => node.type === "form").length, 1);
  assert.equal(findText(form.tree(), "남은 금액을 확인해 주세요."), true);

  await form.submit();
  assert.equal(findElements(form.tree(), (node) => node.type === "form").length, 0);
  assert.equal(findText(form.tree(), "참여했습니다."), true);

  form.clickAdditional();
  assert.equal(findElements(form.tree(), (node) => node.type === "form").length, 1);
  await form.submit();
  assert.equal(findText(form.tree(), "참여했습니다."), true);
});

test("paid 참여 내역이 있으면 안내부터 표시하고 추가 참여 버튼으로 폼을 연다", () => {
  const form = createContributionForm(true, []);

  assert.equal(findElements(form.tree(), (node) => node.type === "form").length, 0);
  assert.equal(findText(form.tree(), "참여했습니다."), true);
  form.clickAdditional();
  assert.equal(findElements(form.tree(), (node) => node.type === "form").length, 1);
});

function loadContributionAction({ participant = { id: "member-id" }, result, failure } = {}) {
  const revalidated = [];
  const redirects = [];
  const actions = loadSource("app/group-gifts/actions.js", {
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
    "next/navigation": {
      redirect(path) {
        redirects.push(path);
        throw new Error(`REDIRECT:${path}`);
      },
    },
    "@/lib/group-gifts": {
      contributeToGroupGift: async () => {
        if (failure) throw failure;
        return result ?? { contributionId: "contribution-id", order: null };
      },
      createGroupGift: async () => null,
      findOpenGroupGiftForProduct: async () => null,
      getGroupGiftById: async () => ({ recipientId: "recipient-id", status: "funding" }),
      retryGroupGiftPayment: async () => null,
    },
    "@/lib/group-gift-otp": {
      getGuestGroupGiftSession: async () => participant?.email ? participant : null,
      requestGuestGroupGiftOtp: async () => null,
      verifyGuestGroupGiftOtp: async () => null,
    },
    "@/lib/products": { getProductById: async () => null },
    "@/lib/session": {
      getCurrentUser: async () => participant?.id ? participant : null,
      requireUser: async () => participant,
    },
    "@/lib/users": {
      findUserByEmail: async () => null,
      findUserById: async () => null,
    },
    "@/lib/utils/format": { sanitizeCallbackPath: () => "/" },
    "@/lib/utils/validation": {
      isValidEmail: () => true,
      parsePositiveInteger: (value) => Number(value) || null,
    },
    "@/lib/wishlists": { isProductInWishlist: async () => false },
  });
  return { actions, revalidated, redirects };
}

function validContributionFormData() {
  const formData = new FormData();
  formData.set("nickname", "참여자");
  formData.set("amount", "1000");
  formData.set("message", "축하해요");
  return formData;
}

test("목표가 남은 참여 성공은 현재 화면에 성공 상태를 반환하고 저장 실패는 오류를 반환한다", async () => {
  const success = loadContributionAction();
  const successState = await success.actions.contributeGroupGiftAction(
    "gift-id",
    { message: "" },
    validContributionFormData(),
  );

  assert.equal(successState.success, true);
  assert.equal(successState.message, "");
  assert.deepEqual(success.redirects, []);
  assert.ok(success.revalidated.includes("/group-gifts/gift-id"));

  const failure = loadContributionAction({ failure: new Error("저장하지 못했습니다.") });
  const failureState = await failure.actions.contributeGroupGiftAction(
    "gift-id",
    { message: "" },
    validContributionFormData(),
  );
  assert.equal(failureState.success, undefined);
  assert.equal(failureState.message, "저장하지 못했습니다.");
  assert.deepEqual(failure.redirects, []);
});

test("목표 달성 후 회원과 이메일 인증 방문자의 기존 이동을 유지한다", async () => {
  const member = loadContributionAction({
    result: { contributionId: "contribution-id", order: { id: "order-id" } },
  });
  await assert.rejects(
    member.actions.contributeGroupGiftAction("gift-id", {}, validContributionFormData()),
    /REDIRECT:\/orders\/order-id/,
  );
  assert.deepEqual(member.redirects, ["/orders/order-id"]);

  const guest = loadContributionAction({
    participant: { email: "friend@example.com" },
    result: { contributionId: "contribution-id", order: { id: "order-id" } },
  });
  await assert.rejects(
    guest.actions.contributeGroupGiftAction("gift-id", {}, validContributionFormData()),
    /REDIRECT:\/group-gifts\/gift-id/,
  );
  assert.deepEqual(guest.redirects, ["/group-gifts/gift-id"]);
});
