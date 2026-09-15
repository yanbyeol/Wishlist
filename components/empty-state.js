import Link from "next/link";
import { GiftIcon } from "@/components/icons";

export default function EmptyState({ title, description, href = "/", action = "상품 둘러보기" }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><GiftIcon size={34} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link href={href} className="button button-primary">{action}</Link>
    </div>
  );
}
