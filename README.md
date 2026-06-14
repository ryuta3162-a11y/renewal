# Renewal Studio

24KYODOWORKSPACE（JOYFIT24経堂）のリニューアルを、竣工図の上に機器を配置したりデッサンしたりしながら検討するWebアプリです。

**Node.js 不要** — HTML/CSS/JS のみ。GitHub に push して Vercel にデプロイするだけで動きます。

## できること

- 竣工図（PDF）を背景に表示
- **自作パーツ** — 筋トレマシンなど任意の名称・色・サイズを登録
- **ドラッグで試着配置** — パーツ選択後、図面上をドラッグしてサイズを決めて配置
- **色分け** — 区分ごとの色、パーツごとに塗り・枠色をカスタム
- **プロ向け操作** — ホイールズーム、角ハンドルで拡縮、スペース+ドラッグで移動
- **右クリック微光メモ** — サイズ感・色・寸法メモを設置、ホバーで表示
- **マシン画像** — 名称で自動紐づけ、右パネルにプレビュー、図面上に画像付き配置
- ペン・線・枠でデッサン、PNG 出力、ブラウザ内自動保存

## マシン画像の登録（LP連携）

1. LPの「マシンラインナップ」画像を `machines/` にコピー（ファイル名は `machines/README.md` 参照）
2. または `machines/manifest.json` の `lpBaseUrl` に LP の画像URLを設定
3. GitHub push → 名称「ランニングマシン」などで自動表示

## Vercel へのデプロイ手順

1. このリポジトリを GitHub に push
2. [vercel.com](https://vercel.com) にログイン
3. **Add New Project** → GitHub リポジトリ `renewal` を選択
4. 設定はそのまま（Framework: Other、Build 不要）
5. **Deploy** をクリック

数分後 `https://あなたのプロジェクト.vercel.app` でアクセスできます。

## ローカルファイル構成

```
renewal/
├── index.html
├── vercel.json
├── css/style.css
├── js/
│   ├── designer.js    # メインロジック
│   ├── constants.js   # 図面・パーツ定義
│   ├── pdf-loader.js
│   └── storage.js
└── drawings/          # 竣工図 PDF
```

## パーツの追加

`js/constants.js` の `EQUIPMENT` に項目を足すと、左パネルに新しいパーツが増えます。
