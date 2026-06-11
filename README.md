# Renewal Studio

経堂物件のリニューアルを、竣工図の上に機器を配置したりデッサンしたりしながら検討するWebアプリです。

**Node.js 不要** — HTML/CSS/JS のみ。GitHub に push して Vercel にデプロイするだけで動きます。

## できること

- 竣工図（PDF）を背景に表示
- **ドラッグ＆ドロップ**で洗濯機・乾燥機・作業台などを配置
- **ペン・線・枠・文字**でフリースケッチ（デッサン）
- 「撤去」「残す」マークで方針を明示
- 配置の**回転・リサイズ・削除**
- 設計の自動保存（ブラウザ内）と **PNG 出力**

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
