import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container error-state">
      <p className="eyebrow">404</p>
      <h1>찾는 페이지가 없어요.</h1>
      <p>링크가 만료되었거나 주소가 잘못되었을 수 있습니다.</p>
      <Link href="/" className="button button-primary">홈으로 돌아가기</Link>
    </div>
  );
}
