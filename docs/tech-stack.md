# Tech Stackの管理

[管理Issue #9](https://github.com/kamekingdom/kamekingdom/issues/9) の一覧から、
READMEに掲載したい技術をチェックしてください。チェックを外すと掲載も解除されます。
保存後、Actionsの **Sync selected Tech Stack** がREADMEを更新します。

候補は14分野・368項目です。元の項目と追加候補を同じ分野にまとめ、分野内では技術名順に並べています。
READMEには選択のある分野名と、その分野のバッジだけが表示されます。
初期選択は元のREADMEの27項目だけで、その後にチェックした項目も保持されます。
候補に含まれていることは、経験・習得済みという意味ではありません。

## 表示を変える

1. 管理Issueで技術を探す。カテゴリは常時表示され、ページ内検索（⌘F / Ctrl+F）も使える。
2. 掲載する技術にチェックを入れ、掲載しない技術のチェックを外す。
3. [同期Actions](https://github.com/kamekingdom/kamekingdom/actions/workflows/sync-tech-stack.yml)
   が成功したら、プロフィールを再読み込みする。

チェックを変更するにはリポジトリのIssue本文を編集できる権限が必要です。
管理Issueは閉じずに使ってください。非表示IDや区切りコメントは削除しないでください。
READMEのバッジは自動生成されるため、選択変更はIssue側で行います。

## 仕組みと同期に失敗した場合

- 選択状態: 管理Issueのチェックボックス。
- 候補の名前・並び順・バッジ: `data/tech-stack.json`。
- バッジ画像: `assets/tech-stack/`。ロゴを画像内に埋め込み、外部のロゴ配信に依存せず表示する。
- 同期先: `data/tech-stack-config.json` の `main` と管理Issue番号。
- 更新範囲: READMEの `tech-stack:start` / `tech-stack:end` コメントの間だけ。

同期のたびに最新のIssue本文とREADMEを取得します。並行したコミットと競合した場合は、
両方を取得し直して最大3回まで試みます。表示に差がなければコミットしません。
未登録ID、重複ID、欠落したチェック項目、壊れた区切りは、READMEを変更せずエラーにします。

Actionsのログを確認し、Issueを直してチェックを変更するか、**Run workflow** で再実行してください。
個人用アクセストークンや追加のシークレットは不要です。

## 候補を追加する開発者向け手順

1. `data/tech-stack.json` の適切な分野に、一意な `id`、`name`、6桁の `color`、`icon`、`badgePath` を追加する。
   既存項目の `id` は変更しない。分野内は名前順にする。
2. 最新の管理Issue本文をファイルに保存する。
3. 既存の選択を保持して新しいチェックリストを作る。

   ```sh
   node scripts/sync-tech-stack.mjs --checklist --issue-file /path/to/current-issue.md
   ```

4. `npm ci --ignore-scripts` と `npm run tech-stack:badges` でバッジを作り、`npm test` を実行してPRを作る。
5. カタログがmainに反映されたら、新しい本文で管理Issueを更新する。新規項目は未選択になる。

`npm run tech-stack:checklist` はローカルREADMEの選択から本文を生成します。
Issue側で変更したばかりの場合は、最新の本文を指定する方法を使ってください。

## ロゴ・配色を更新する

- Simple Icons 16.37.0のロゴとブランドカラーを基本にする。
- Simple Iconsで提供されないAWS・CSS3・C#・Azureなどは、Deviconから取得したSVGを使用する。
- OpenAIはLobe Icons、XGBoost・LightGBM・CatBoostは各プロジェクトの公開ロゴを使用する。
- プラットフォームの一部である技術には、そのプラットフォームのロゴを使用する場合がある。
- SQLのように単一のブランドロゴがないものや、ロゴを収録していない技術には分野の記号を使用する。

取得元とSHA-256は `data/tech-stack-logo-sources.json` に記録し、原本は
`assets/tech-stack/sources/` に保存します。取得後の通常の画像生成はネットワーク不要です。
Simple Iconsのバージョンはpackage-lock.jsonで固定しています。

```sh
npm ci --ignore-scripts
npm run tech-stack:badges
# 原本を取得し直す場合のみ
npm run tech-stack:badges -- --refresh
```

色・ロゴの定義を変えたら、生成SVGも一緒にコミットしてください。
CIでは保存済みの原本から再生成し、コミット済みの画像との差がないことを検証します。
取得元のライセンスは `assets/tech-stack/licenses/` とTHIRD_PARTY_NOTICES.mdに記載しています。
