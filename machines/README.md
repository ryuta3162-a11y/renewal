# マシン画像フォルダ

LPの「マシンラインナップ」の画像をここに置くと、**名称で自動紐づけ**されます。

## 手順（1回だけ）

1. LPの `マシンラインナップ` から画像を保存
2. 下記のファイル名にリネームしてこのフォルダに入れる
3. GitHub に push → Vercel が自動更新

## ファイル名一覧

| マシン名 | ファイル名 |
|---------|-----------|
| ランニングマシン | `treadmill.webp` |
| アセントトレーナー | `ascent-trainer.webp` |
| バイクマシン | `bike.webp` |
| レッグプレス | `leg-press.webp` |
| ラットプルダウン | `lat-pulldown.webp` |
| … | `manifest.json` を参照 |

`.png` / `.jpg` も使えます。その場合は `manifest.json` の `file` を変更してください。

## LPから直接読み込む場合

`manifest.json` の `lpBaseUrl` に LP の画像フォルダ URL を設定できます。

```json
"lpBaseUrl": "https://あなたのLP.vercel.app/images/machines"
```

同一ドメインにまとめると管理が楽です。おすすめは **このフォルダにコピー** です。
