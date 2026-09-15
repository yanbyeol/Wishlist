import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { GiftIcon } from "@/components/icons";

export default function SiteHeader({ user }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="WishMate 홈">
          <span className="brand-mark"><GiftIcon size={21} /></span>
          <span>WishMate</span>
        </Link>

        <nav className="main-nav" aria-label="주요 메뉴">
          <Link href="/">상품 둘러보기</Link>
          {user ? (
            <>
              <Link href="/wishlist">위시리스트</Link>
              <Link href="/mypage">마이페이지</Link>
              <form action={signOutAction}>
                <button className="nav-button" type="submit">로그아웃</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">로그인</Link>
              <Link href="/signup" className="header-cta">회원가입</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
