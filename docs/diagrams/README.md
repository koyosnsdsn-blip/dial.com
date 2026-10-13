# フロー図・機能一覧の元データ（2026-10-13 作成）

公開先（claude.ai の Artifact。社内向け・非公開）
- ダイヤル.com フロー図：https://claude.ai/artifact/5M8Es5gwV9qm9nUv8NRr2E（操作フロー4場面＋システムの図4枚）
- ダイヤル.com 機能一覧：https://claude.ai/artifact/PYo5EnLkJg6SNd8NnC6c1e（状態とメモは Artifact のデータに保存。ここの features.json は初版）

| ファイル | 中身 |
|---|---|
| `archify/*.json` | システムの図の元データ（archify。全体構成・相談の流れ・メッセージ送信のシーケンス・案件の状態）。各部品の `sources` は、コミット fc7000d のコードの行を指す |
| `pages/flow.html` | 操作フローのページ（場面・手順はページ内の `SCENES` に書いてある） |
| `pages/features.html` | 機能一覧のページ（データは Artifact の db の `features` コレクション） |
| `features.json` | 機能一覧の初版（101件） |

図を作り直すとき：archify（explain-kit のスキル）で `finalize <type> <json> <html> --repo-root <このリポジトリ> --quality showcase`。コードの行が変わったら、`meta.repository.revision` と `sources` の行を合わせる。
