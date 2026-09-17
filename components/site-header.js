"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { GiftIcon } from "@/components/icons";
import NotificationMenu from "@/components/notification-menu";
import { getModeFromPath } from "@/components/site-header-mode";
import StatusBadge from "@/components/status-badge";

function AccountMenu({ currentMode, userName }) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

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
          <Link
            href={currentMode === "seller" ? "/" : "/seller"}
            role="menuitem"
            onClick={() => setIsAccountMenuOpen(false)}
          >
            {currentMode === "seller" ? "사용자 모드로 전환" : "판매자 모드로 전환"}
          </Link>
          <form action={signOutAction}>
            <button type="submit" role="menuitem">로그아웃</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function SiteHeader({
  isLoggedIn,
  userName,
  notifications = [],
  unreadNotificationCount = 0,
}) {
  const pathname = usePathname() ?? "/";
  const currentMode = getModeFromPath(pathname);
  const homePath = currentMode === "seller" ? "/seller" : "/";
  const isSellerProductsPath = pathname === "/seller/products" || pathname.startsWith("/seller/products/");

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href={homePath} className="brand" aria-label={currentMode === "seller" ? "WishMate 판매 홈" : "WishMate 홈"}>
          <span className="brand-mark"><GiftIcon size={21} /></span>
          <span>WishMate</span>
        </Link>

        <nav className="main-nav" aria-label="주요 메뉴">
          {isLoggedIn ? (
            <>
              {currentMode === "user" ? (
                <>
                  <Link href="/">상품 둘러보기</Link>
                  <Link href="/wishlist">위시리스트</Link>
                  <Link href="/mypage/gifts">받은·보낸 선물</Link>
                  <Link href="/mypage">마이페이지</Link>
                </>
              ) : (
                <>
                  <Link href="/seller" className="seller-nav-link" aria-current={pathname === "/seller" || pathname === "/seller/" ? "page" : undefined}>판매 홈</Link>
                  <Link href="/seller/products" className="seller-nav-link" aria-current={isSellerProductsPath ? "page" : undefined}>상품 관리</Link>
                  <Link href="/seller/orders" className="seller-nav-link" aria-current={pathname === "/seller/orders" ? "page" : undefined}>주문 관리</Link>
                  <Link href="/products/new" className="seller-nav-link" aria-current={pathname === "/products/new" ? "page" : undefined}>상품 등록</Link>
                </>
              )}
              <div className="header-user-controls">
                {/* 주소가 바뀌면 열린 메뉴와 로컬 알림 상태를 새로 동기화합니다. */}
                <NotificationMenu
                  key={`notifications-${pathname}`}
                  initialNotifications={notifications}
                  initialUnreadCount={unreadNotificationCount}
                />
                <AccountMenu key={`account-${pathname}`} currentMode={currentMode} userName={userName} />
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
