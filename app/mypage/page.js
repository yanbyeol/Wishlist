import Link from "next/link";
import { connection } from "next/server";
import { listAddresses } from "@/lib/addresses";
import { listReceivedOrders, listSentOrders } from "@/lib/orders";
import { requireUser } from "@/lib/session";

export const metadata = { title: "마이페이지" };

export default async function MyPage() {
  await connection();
  const user = await requireUser("/mypage");
  const [addresses, receivedOrders, sentOrders] = await Promise.all([
    listAddresses(user.id),
    listReceivedOrders(user.id),
    listSentOrders(user.id),
  ]);

  return (
    <section className="container page-section">
      <div className="page-heading">
        <p className="eyebrow">My WishMate</p>
        <h1>{user.name}님, 반가워요</h1>
        <p>{user.email}</p>
      </div>

      <div className="dashboard-grid">
        <Link href="/mypage/addresses" className="dashboard-card">
          <span className="dashboard-card-icon">⌂</span>
          <div><p>배송지 관리</p><strong>{addresses.length}개</strong><small>선물 받을 주소를 저장해 두세요.</small></div>
          <span>→</span>
        </Link>
        <Link href="/mypage/gifts" className="dashboard-card">
          <span className="dashboard-card-icon">♥</span>
          <div><p>받은·보낸 선물</p><strong>{receivedOrders.length + sentOrders.length}개</strong><small>받은 선물 {receivedOrders.length}개 · 보낸 선물 {sentOrders.length}개</small></div>
          <span>→</span>
        </Link>
      </div>
    </section>
  );
}
