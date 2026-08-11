// 세션이 꼬여 화면이 죽어도 눌리는 탈출구 — 평범한 form POST 라 자바스크립트 없이도 동작한다.
// 링크(GET)로 바꾸지 마라: prefetch 만으로 로그아웃된다 (src/app/auth/signout/route.ts).
// 되돌릴 수 없는 일이 아니라 묻지 않는다 (common/ConfirmRow.tsx 의 기준) — 도착한 /login 이 알린다.

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        로그아웃하기
      </button>
    </form>
  )
}
