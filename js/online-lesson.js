/** ⑩ オンラインレッスンについて — JOYFIT Online Lesson 利用フロー（5画面） */

export const ONLINE_LESSON_STEPS = [
  {
    no: 1,
    title: "初期画面で「サービス」をタップ",
    subtitle: "JOYFITアプリ ホーム → 右上サービス",
    image: "/assets/online-lesson/01-home-service.png",
    highlight: "top-right",
    points: [
      "JOYFITアプリのホーム画面を開く",
      "右上のグリッドアイコン「サービス」をタップ",
      "ここからサービス一覧へ進む（最初の一歩）",
    ],
    note: "リニューアル検討：来館者への「アプリ→サービス」案内",
  },
  {
    no: 2,
    title: "オンラインレッスンを選ぶ",
    subtitle: "サービス一覧 → オンラインレッスン",
    image: "/assets/online-lesson/02-service-list.png",
    points: [
      "「サービス一覧」が開く",
      "オプショナルメニュー内の「オンラインレッスン」をタップ",
      "Webの Online Lesson サイトへ遷移",
    ],
    note: "リニューアル検討：POP・受付での導線説明",
  },
  {
    no: 3,
    title: "ログイン",
    subtitle: "メールアドレス・パスワード",
    image: "/assets/online-lesson/03-login.png",
    points: [
      "会員登録済みのメールアドレスでログイン",
      "初回は新規登録フローへ",
      "パスワード忘れの再設定リンクあり",
    ],
    note: "リニューアル検討：入会時のオンラインレッスン説明タイミング",
  },
  {
    no: 4,
    title: "メール認証で登録完了",
    subtitle: "【JOYFIT Online Lesson】メールアドレス確認",
    image: "/assets/online-lesson/04-email-confirm.png",
    points: [
      "登録後、確認メールが届く",
      "メール内URLにアクセスして登録完了",
      "登録完了後、ダイレクトリンクで次画面へ",
    ],
    note: "リニューアル検討：案内物・デジタルサイネージでの手順掲示",
  },
  {
    no: 5,
    title: "オンラインレッスン トップへ",
    subtitle: "登録完了 → ダイレクトリンクで到達",
    image: "/assets/online-lesson/05-lesson-top.png",
    points: [
      "JOY FIT Online Lesson のトップ画面が開く",
      "LIVE / 動画レッスン / マタニティヨガ などから受講開始",
      "おすすめレッスン・キャンペーンもここから確認",
    ],
    note: "リニューアル検討：スタジオ区画との役割分担（対面 vs オンライン）",
  },
];

export const ONLINE_LESSON_SUMMARY = {
  service: "JOY FIT Online Lesson",
  url: "ol-member-prod.fly.dev",
  types: ["LIVEレッスン", "動画レッスン", "マタニティヨガ", "パーソナルレッスン予約"],
  flowNote:
    "①アプリ右上「サービス」→ ②オンラインレッスン → ③ログイン → ④メール認証 → ⑤OLトップ（登録完了後ダイレクト）",
};

export function renderOnlineLessonModal() {
  const stepsHtml = ONLINE_LESSON_STEPS.map((s) => {
    const highlight =
      s.highlight === "top-right"
        ? `<span class="ol-img-highlight ol-img-highlight-tr" title="サービス"></span>`
        : "";
    return `
    <article class="ol-step">
      <div class="ol-step-head">
        <span class="ol-step-no">${s.no}</span>
        <div>
          <h4>${esc(s.title)}</h4>
          <p class="ol-step-sub">${esc(s.subtitle)}</p>
        </div>
      </div>
      <figure class="ol-step-fig${s.highlight ? " ol-step-fig-highlighted" : ""}">
        <img src="${esc(s.image)}" alt="${esc(s.title)}" loading="lazy" onerror="this.src='${esc(s.image.replace('.png', '.svg'))}'" />
        ${highlight}
      </figure>
      <ul class="ol-step-points">
        ${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}
      </ul>
      <p class="ol-step-note">${esc(s.note)}</p>
    </article>`;
  }).join("");

  return `
    <div class="ol-intro">
      <p><strong>${esc(ONLINE_LESSON_SUMMARY.service)}</strong> の会員向け利用フロー（全5画面）です。</p>
      <p class="ol-flow-line">${esc(ONLINE_LESSON_SUMMARY.flowNote)}</p>
      <p class="ol-tags">${ONLINE_LESSON_SUMMARY.types.map((t) => `<span>${esc(t)}</span>`).join("")}</p>
    </div>
    <div class="ol-steps ol-steps-5">${stepsHtml}</div>
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
