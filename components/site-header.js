"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { GiftIcon } from "@/components/icons";
import NotificationMenu from "@/components/notification-menu";
import { getModeFromPath } from "@/components/site-header-mode";
import StatusBadge from "@/components/status-badge";

function AccountMenu({ currentMode, onNavigate, userName }) {
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
            onClick={() => {
              setIsAccountMenuOpen(false);
              onNavigate();
            }}
          >
            {currentMode === "seller" ? "사용자 모드로 전환" : "판매자 모드로 전환"}
          </Link>
          <form action={signOutAction} onSubmit={onNavigate}>
            <button type="submit" role="menuitem">로그아웃</button>
          </form>
        </div>
      )}
    </div>
  );
}

function GiftSessionControl({ onNavigate, userName }) {
  return (
    <div className="header-user-controls gift-session-controls">
      <div className="gift-session-label">
        <span className="account-user-name">{userName || "간편 사용자"}</span>
        <StatusBadge tone="neutral">선물 간편 인증</StatusBadge>
      </div>
      <Link href="/login" onClick={onNavigate}>회원 로그인</Link>
      <form action={signOutAction} onSubmit={onNavigate}>
        <button className="text-button" type="submit">인증 종료</button>
      </form>
    </div>
  );
}

export default function SiteHeader({
  isLoggedIn,
  isGiftAuthenticated = false,
  userName,
  giftUserName = "",
  notifications = [],
  unreadNotificationCount = 0,
}) {
  const pathname = usePathname() ?? "/";
  const currentMode = isLoggedIn ? getModeFromPath(pathname) : "user";
  const homePath = currentMode === "seller" ? "/seller" : "/";
  const isSellerProductsPath = pathname === "/seller/products" || pathname.startsWith("/seller/products/");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerRef = useRef(null);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    function closeMobileMenu(event) {
      if (!headerRef.current?.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    }

    function closeMobileMenuWithEscape(event) {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeMobileMenu);
    document.addEventListener("keydown", closeMobileMenuWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMobileMenu);
      document.removeEventListener("keydown", closeMobileMenuWithEscape);
    };
  }, [isMobileMenuOpen]);

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
  }

  return (
    <header className="site-header" ref={headerRef}>
      <div className="container header-inner">
        <Link
          href={homePath}
          className="brand"
          aria-label={currentMode === "seller" ? "WishMate 판매 홈" : "WishMate 홈"}
          onClick={closeMobileMenu}
        >
          <span className="brand-mark"><GiftIcon size={21} /></span>
          <span>WishMate</span>
        </Link>

        <button
          className="mobile-menu-trigger"
          type="button"
          aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-controls="primary-navigation"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          <span className="mobile-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <nav
          id="primary-navigation"
          className={isMobileMenuOpen ? "main-nav mobile-menu-open" : "main-nav"}
          aria-label="주요 메뉴"
        >
          {isLoggedIn ? (
            <>
              {currentMode === "user" ? (
                <>
                  <Link href="/" onClick={closeMobileMenu}>상품 둘러보기</Link>
                  <Link href="/wishlist" onClick={closeMobileMenu}>위시리스트</Link>
                  <Link href="/mypage/gifts" onClick={closeMobileMenu}>받은·보낸 선물</Link>
                  <Link href="/mypage" onClick={closeMobileMenu}>마이페이지</Link>
                </>
              ) : (
                <>
                  <Link
                    href="/seller"
                    className="seller-nav-link"
                    aria-current={pathname === "/seller" || pathname === "/seller/" ? "page" : undefined}
                    onClick={closeMobileMenu}
                  >
                    판매 홈
                  </Link>
                  <Link
                    href="/seller/products"
                    className="seller-nav-link"
                    aria-current={isSellerProductsPath ? "page" : undefined}
                    onClick={closeMobileMenu}
                  >
                    상품 관리
                  </Link>
                  <Link
                    href="/seller/orders"
                    className="seller-nav-link"
                    aria-current={pathname === "/seller/orders" ? "page" : undefined}
                    onClick={closeMobileMenu}
                  >
                    주문 관리
                  </Link>
                  <Link
                    href="/products/new"
                    className="seller-nav-link"
                    aria-current={pathname === "/products/new" ? "page" : undefined}
                    onClick={closeMobileMenu}
                  >
                    상품 등록
                  </Link>
                </>
              )}
              <div className="header-user-controls">
                {/* 주소가 바뀌면 열린 메뉴와 로컬 알림 상태를 새로 동기화합니다. */}
                <NotificationMenu
                  key={`notifications-${pathname}`}
                  initialNotifications={notifications}
                  initialUnreadCount={unreadNotificationCount}
                />
                <AccountMenu
                  key={`account-${pathname}`}
                  currentMode={currentMode}
                  onNavigate={closeMobileMenu}
                  userName={userName}
                />
              </div>
            </>
          ) : isGiftAuthenticated ? (
            <>
              <Link href="/" onClick={closeMobileMenu}>상품 둘러보기</Link>
              <GiftSessionControl
                onNavigate={closeMobileMenu}
                userName={giftUserName}
              />
            </>
          ) : (
            <>
              <Link href="/" onClick={closeMobileMenu}>상품 둘러보기</Link>
              <Link href="/login" onClick={closeMobileMenu}>로그인</Link>
              <Link href="/signup" className="header-cta" onClick={closeMobileMenu}>회원가입</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
