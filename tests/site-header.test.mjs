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

test("모바일 헤더 메뉴는 버튼으로 열리고 메뉴 이동 시 닫힌다", () => {
  let isMobileMenuOpen = false;
  let stateCallIndex = 0;
  const SiteHeader = loadSource("components/site-header.js", {
    "next/link": "Link",
    "next/navigation": { usePathname: () => "/" },
    react: {
      useEffect() {},
      useRef: (initialValue) => ({ current: initialValue }),
      useState(initialValue) {
        const currentCallIndex = stateCallIndex;
        stateCallIndex += 1;

        if (currentCallIndex === 0) {
          return [isMobileMenuOpen, (update) => {
            isMobileMenuOpen = typeof update === "function"
              ? update(isMobileMenuOpen)
              : update;
          }];
        }

        return [initialValue, () => {}];
      },
    },
    "@/app/(auth)/actions": { signOutAction: "signOutAction" },
    "@/components/icons": { GiftIcon: "GiftIcon" },
    "@/components/notification-menu": "NotificationMenu",
    "@/components/site-header-mode": { getModeFromPath: () => "user" },
    "@/components/status-badge": "StatusBadge",
  }).default;

  function renderHeader() {
    stateCallIndex = 0;
    return SiteHeader({
      isLoggedIn: true,
      userName: "한별",
      notifications: [],
      unreadNotificationCount: 0,
    });
  }

  const closedTree = renderHeader();
  const openButton = findElements(
    closedTree,
    (node) => node.props.className === "mobile-menu-trigger",
  )[0];
  assert.equal(openButton.props["aria-expanded"], false);
  assert.equal(openButton.props["aria-label"], "메뉴 열기");
  assert.equal(
    findElements(closedTree, (node) => node.type === "nav")[0].props.className,
    "main-nav",
  );

  openButton.props.onClick();
  const openTree = renderHeader();
  const closeButton = findElements(
    openTree,
    (node) => node.props.className === "mobile-menu-trigger",
  )[0];
  const openNavigation = findElements(openTree, (node) => node.type === "nav")[0];
  assert.equal(closeButton.props["aria-expanded"], true);
  assert.equal(closeButton.props["aria-label"], "메뉴 닫기");
  assert.equal(openNavigation.props.className, "main-nav mobile-menu-open");

  const wishlistLink = findElements(
    openTree,
    (node) => node.type === "Link" && node.props.href === "/wishlist",
  )[0];
  wishlistLink.props.onClick();

  const closedAfterNavigation = renderHeader();
  assert.equal(
    findElements(closedAfterNavigation, (node) => node.type === "nav")[0].props.className,
    "main-nav",
  );
});

test("선물 간편 인증 사용자는 회원 메뉴와 판매자 전환 없이 인증 상태만 표시한다", () => {
  const SiteHeader = loadSource("components/site-header.js", {
    "next/link": "Link",
    "next/navigation": { usePathname: () => "/" },
    react: {
      useEffect() {},
      useRef: (initialValue) => ({ current: initialValue }),
      useState: (initialValue) => [initialValue, () => {}],
    },
    "@/app/(auth)/actions": { signOutAction: "signOutAction" },
    "@/components/icons": { GiftIcon: "GiftIcon" },
    "@/components/notification-menu": "NotificationMenu",
    "@/components/site-header-mode": { getModeFromPath: () => "user" },
    "@/components/status-badge": "StatusBadge",
  }).default;
  const tree = SiteHeader({
    isLoggedIn: false,
    isGiftAuthenticated: true,
    giftUserName: "간편 사용자",
  });
  const giftSessionControl = findElements(
    tree,
    (node) => typeof node.type === "function" && node.type.name === "GiftSessionControl",
  )[0];
  const controlTree = giftSessionControl.type(giftSessionControl.props);
  const links = findElements(controlTree, (node) => node.type === "Link");
  const linkPaths = links.map((link) => link.props.href);

  assert.equal(linkPaths.includes("/login"), true);
  assert.equal(findElements(tree, (node) => node.props.href === "/wishlist").length, 0);
  assert.equal(findElements(tree, (node) => node.props.href === "/mypage").length, 0);
  assert.equal(findElements(tree, (node) => node.props.href === "/seller").length, 0);
  assert.equal(findElements(tree, (node) => node.type === "NotificationMenu").length, 0);
  assert.equal(
    findElements(controlTree, (node) => node.type === "StatusBadge" && node.props.children === "선물 간편 인증").length,
    1,
  );
  assert.equal(
    findElements(controlTree, (node) => node.type === "button" && node.props.children === "인증 종료").length,
    1,
  );
});
