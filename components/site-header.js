"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { GiftIcon } from "@/components/icons";

function getModeFromPath(pathname) {
  const isSellerPath =
    pathname.startsWith("/seller/") ||
    pathname === "/products/new" ||
    /^\/products\/[^/]+\/edit\/?$/.test(pathname);

  return isSellerPath ? "seller" : "user";
}

export default function SiteHeader({ isLoggedIn }) {
  const [currentMode, setCurrentMode] = useState("user");

  useEffect(() => {
    function syncModeWithPath() {
      setCurrentMode(getModeFromPath(window.location.pathname));
    }

    syncModeWithPath();
    window.addEventListener("popstate", syncModeWithPath);
    return () => window.removeEventListener("popstate", syncModeWithPath);
  }, []);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="WishMate 홈" onClick={() => setCurrentMode("user")}>
          <span className="brand-mark"><GiftIcon size={21} /></span>
          <span>WishMate</span>
        </Link>

        <nav className="main-nav" aria-label="주요 메뉴">
          {isLoggedIn ? (
            <>
              <div className="mode-switch" aria-label="이용 모드 전환">
                <Link
                  href="/"
                  className={currentMode === "user" ? "active" : ""}
                  aria-current={currentMode === "user" ? "page" : undefined}
                  onClick={() => setCurrentMode("user")}
                >
                  사용자 모드
                </Link>
                <Link
                  href="/seller/products"
                  className={currentMode === "seller" ? "active" : ""}
                  aria-current={currentMode === "seller" ? "page" : undefined}
                  onClick={() => setCurrentMode("seller")}
                >
                  판매자 모드
                </Link>
              </div>
              {currentMode === "user" ? (
                <>
                  <Link href="/" onClick={() => setCurrentMode("user")}>상품 둘러보기</Link>
                  <Link href="/wishlist" onClick={() => setCurrentMode("user")}>위시리스트</Link>
                  <Link href="/mypage/gifts" onClick={() => setCurrentMode("user")}>받은·보낸 선물</Link>
                  <Link href="/mypage" onClick={() => setCurrentMode("user")}>마이페이지</Link>
                </>
              ) : (
                <>
                  <Link href="/products/new" onClick={() => setCurrentMode("seller")}>상품 등록</Link>
                  <Link href="/seller/products" onClick={() => setCurrentMode("seller")}>내 상품</Link>
                  <Link href="/seller/orders" onClick={() => setCurrentMode("seller")}>주문 관리</Link>
                </>
              )}
              <form action={signOutAction}>
                <button className="nav-button" type="submit">로그아웃</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/">상품 둘러보기</Link>
              <Link href="/login">로그인</Link>
              <Link href="/signup" className="header-cta">회원가입</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
