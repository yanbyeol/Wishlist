import "./globals.css";
import { connection } from "next/server";
import SiteHeader from "@/components/site-header";
import { getCurrentUser } from "@/lib/session";

export const metadata = {
  title: {
    default: "WishMate | 함께 선물해요",
    template: "%s | WishMate",
  },
  description: "나와 친구의 위시리스트를 함께 채우는 선물 기반 쇼핑몰",
};

export default async function RootLayout({ children }) {
  await connection();
  const user = await getCurrentUser();

  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <SiteHeader user={user} />
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <div>
              <strong>WishMate</strong>
              <p>마음을 고르고, 함께 전하는 선물</p>
            </div>
            <p>결제와 배송은 시연용 목업으로 처리됩니다.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
