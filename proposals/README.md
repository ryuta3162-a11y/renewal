# リニューアル案の共有

チームで共有する案は `manifest.json` に登録し、画像をこのフォルダに置きます。

## 追加例

```json
{
  "proposals": [
    {
      "id": "plan-tanaka-2025",
      "name": "田中案",
      "author": "田中",
      "sheets": [
        {
          "id": "tanaka-1f",
          "name": "1Fレイアウト案",
          "file": "/proposals/tanaka-1f.png",
          "kind": "image",
          "baseDrawing": "kyodo-7"
        }
      ]
    }
  ]
}
```

アプリ内の「＋ 案取込」からブラウザに直接画像を取り込むこともできます（そのPC内に保存）。
