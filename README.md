# workout-tracker — Health Cockpit

個人向け健康管理アプリ（食事・筋トレ・水分・体組成・ヘルスケア統合）。GitHub Pages で配信。

## 構成（2026-07-10 Supabase 移行完了後）

| ファイル | 役割 |
|---|---|
| `app.html` | メインアプリ（PWA）。記録・週次レビュー・eufy CSV 取込・バックアップ |
| `health-import.html` | Apple Health zip 取込（端末内解析 → Supabase 保存） |
| `index.html` | ミニマルハブ（アプリ・取込・旧シート閲覧へのリンク） |
| `js/supabase-client.js` | Supabase データ層（認証・テーブル別読み書き・オフラインキュー `hs:sb-queue:v1`） |
| `js/storage.js` ほか | localStorage 一次ストア・栄養計算・食品カタログ |
| `sw.js` | Service Worker（更新時はキャッシュバージョンを必ず上げる） |

- **バックエンド**: Supabase（Auth の email+password ログイン + PostgREST + RLS）。旧 GAS/スプレッドシート経路は 2026-07-10 に退役
- **ログイン**: app.html から。パスワードは利用者本人のみが知る（コード・ドキュメントに書かない）
- フロントに置く鍵は publishable キーのみ（権限は RLS が決める）。secret キーは絶対にコミットしない

## 開発

```
python3 -m http.server 8931       # ローカル確認（SWの旧キャッシュに注意）
node scripts/check_build.js       # push 前の結合構文チェック
git grep -iE 'service_role|sb_secret'   # 空であること
```

ルール・仕様の正は司令塔リポジトリ `health-sambo`（`CLAUDE.md` / `specs/`）。
