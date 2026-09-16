"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { GiftIcon } from "@/components/icons";
import StatusBadge from "@/components/status-badge";

function getModeFromPath(pathname) {
  const isSellerPath =
    pathname.startsWith("/seller/") ||
    pathname === "/products/new" ||
    /^\/products\/[^/]+\/edit\/?$/.test(pathname);

  return isSellerPath ? "seller" : "user";
}

export default function SiteHeader({ isLoggedIn, userName }) {
  const [currentMode, setCurrentMode] = useState("user");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    function syncModeWithPath() {
      setCurrentMode(getModeFromPath(window.location.pathname));
    }

    syncModeWithPath();
    window.addEventListener("popstate", syncModeWithPath);
    return () => window.removeEventListener("popstate", syncModeWithPath);
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function closeAccountMenu(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    }

    function closeAccountMenuWithEscape(event) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeAccountMenu);
    document.addEventListener("keydown", closeAccountMenuWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeAccountMenu);
      document.removeEventListener("keydown", closeAccountMenuWithEscape);
    };
  }, [isAccountMenuOpen]);

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
              <div className="account-menu" ref={accountMenuRef}>
                <button
                  className="account-menu-trigger"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isAccountMenuOpen}
                  onClick={() => setIsAccountMenuOpen((open) => !open)}
                >
                  <span className="account-user-name">{userName || "회원"}</span>
                  <StatusBadge tone={currentMode === "seller" ? "accent" : "neutral"}>
                    {currentMode === "seller" ? "판매자" : "사용자"}
                  </StatusBadge>
                  <span className={`account-menu-arrow ${isAccountMenuOpen ? "open" : ""}`} aria-hidden="true">▾</span>
                </button>

                {isAccountMenuOpen && (
                  <div className="account-dropdown" role="menu" aria-label="계정 메뉴">
                    {currentMode === "user" ? (
                      <Link
                        href="/seller/products"
                        role="menuitem"
                        onClick={() => {
                          setCurrentMode("seller");
                          setIsAccountMenuOpen(false);
                        }}
                      >
                        판매자 모드로 전환
                      </Link>
                    ) : (
                      <>
                        <Link
                          href="/"
                          role="menuitem"
                          onClick={() => {
                            setCurrentMode("user");
                            setIsAccountMenuOpen(false);
                          }}
                        >
                          사용자 모드로 전환
                        </Link>
                        <Link href="/seller/products" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                          판매자 관리
                        </Link>
                      </>
                    )}
                    <form action={signOutAction}>
                      <button type="submit" role="menuitem">로그아웃</button>
                    </form>
                  </div>
                )}
              </div>
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
