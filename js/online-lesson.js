/** ⑩ オンラインレッスンについて — JOYFIT Online Lesson 利用フロー */

export const ONLINE_LESSON_STEPS = [
  {
    no: 1,
    title: "アプリから入る",
    subtitle: "サービス一覧 → オンラインレッスン",
    image: "/assets/online-lesson/01-app-service.svg",
    points: [
      "JOYFIT公式アプリの「サービス一覧」を開く",
      "オプショナルメニュー内の「オンラインレッスン」をタップ",
      "店舗アプリからオンラインサービスへ遷移する導線",
    ],
    note: "リニューアル検討：店舗来館者への案内導線・POP配置",
  },
  {
    no: 2,
    title: "レッスンを選ぶ",
    subtitle: "JOY FIT Online Lesson トップ",
    image: "/assets/online-lesson/02-lesson-home.svg",
    points: [
      "LIVEレッスン / 動画レッスン / マタニティヨガ などから選択",
      "キャンペーン・おすすめレッスン（例：10分動画）を確認",
      "カレンダー・インストラクターからも検索可能",
    ],
    note: "リニューアル検討：スタジオ系区画との役割分担（対面 vs オンライン）",
  },
  {
    no: 3,
    title: "ログイン",
    subtitle: "メールアドレス・パスワード",
    image: "/assets/online-lesson/03-login.svg",
    points: [
      "会員登録済みのメールアドレスでログイン",
      "初回は新規登録フローへ",
      "パスワード忘れの再設定リンクあり",
    ],
    note: "リニューアル検討：受付・入会時のオンラインレッスン説明タイミング",
  },
  {
    no: 4,
    title: "メール認証で登録完了",
    subtitle: "【JOYFIT Online Lesson】メールアドレス確認",
    image: "/assets/online-lesson/04-email-confirm.svg",
    points: [
      "登録後、確認メールが届く",
      "メール内URLにアクセスして登録完了",
      "その後ログインしてレッスン受講開始",
    ],
    note: "リニューアル検討：案内物・デジタルサイネージでの手順掲示",
  },
];

export const ONLINE_LESSON_SUMMARY = {
  service: "JOY FIT Online Lesson",
  url: "ol-member-prod.fly.dev",
  types: ["LIVEレッスン", "動画レッスン", "マタニティヨガ", "パーソナルレッスン予約"],
};

export function renderOnlineLessonModal() {
  const stepsHtml = ONLINE_LESSON_STEPS.map(
    (s) => `
    <article class="ol-step">
      <div class="ol-step-head">
        <span class="ol-step-no">${s.no}</span>
        <div>
          <h4>${esc(s.title)}</h4>
          <p class="ol-step-sub">${esc(s.subtitle)}</p>
        </div>
      </div>
      <figure class="ol-step-fig">
        <img src="${esc(s.image)}" alt="${esc(s.title)}" loading="lazy" />
      </figure>
      <ul class="ol-step-points">
        ${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}
      </ul>
      <p class="ol-step-note">${esc(s.note)}</p>
    </article>`
  ).join("");

  return `
    <div class="ol-intro">
      <p><strong>${esc(ONLINE_LESSON_SUMMARY.service)}</strong> の会員向け利用フローです。経堂リニューアルでは、店舗動線・スタジオ区画とあわせて検討してください。</p>
      <p class="ol-tags">${ONLINE_LESSON_SUMMARY.types.map((t) => `<span>${esc(t)}</span>`).join("")}</p>
    </div>
    <div class="ol-steps">${stepsHtml}</div>
  `;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openOnlineLessonModal() {
  const modal = document.getElementById("online-lesson-modal");
  const body = document.getElementById("online-lesson-body");
  if (!modal || !body) return;
  body.innerHTML = renderOnlineLessonModal();
  modal.showModal();
}
