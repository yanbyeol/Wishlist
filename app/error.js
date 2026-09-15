"use client";

export default function ErrorPage({ reset }) {
  return (
    <div className="container error-state">
      <p className="eyebrow">잠시 문제가 생겼어요</p>
      <h1>화면을 불러오지 못했습니다.</h1>
      <p>MongoDB 연결과 환경 변수를 확인한 뒤 다시 시도해 주세요.</p>
      <button className="button button-primary" type="button" onClick={reset}>다시 시도하기</button>
    </div>
  );
}
