# Tech Stackの管理

[管理Issue #9](https://github.com/kamekingdom/kamekingdom/issues/9) の一覧から、
READMEに掲載したい技術をチェックしてください。チェックを外すと掲載も解除されます。
保存後、Actionsの **Sync selected Tech Stack** がREADMEを更新します。

候補は19カテゴリ・368項目です。初期選択は元のREADMEの27項目だけで、追加候補は未選択です。
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
- 同期先: `data/tech-stack-config.json` の `main` と管理Issue番号。
- 更新範囲: READMEの `tech-stack:start` / `tech-stack:end` コメントの間だけ。

同期のたびに最新のIssue本文とREADMEを取得します。並行したコミットと競合した場合は、
両方を取得し直して最大3回まで試みます。表示に差がなければコミットしません。
未登録ID、重複ID、欠落したチェック項目、壊れた区切りは、READMEを変更せずエラーにします。

Actionsのログを確認し、Issueを直してチェックを変更するか、**Run workflow** で再実行してください。
個人用アクセストークンや追加のシークレットは不要です。

## 候補を追加する開発者向け手順

1. `data/tech-stack.json` の適切なカテゴリに、一意な `id`、`name`、6桁の `color` を追加する。
   既存項目の `id` は変更しない。専用バッジを使う場合はShieldsの `badgeUrl` を指定できる。
2. 最新の管理Issue本文をファイルに保存する。
3. 既存の選択を保持して新しいチェックリストを作る。

   ```sh
   node scripts/sync-tech-stack.mjs --checklist --issue-file /path/to/current-issue.md
   ```

4. `npm test` を実行し、PRを作る。
5. カタログがmainに反映されたら、新しい本文で管理Issueを更新する。新規項目は未選択になる。

`npm run tech-stack:checklist` はローカルREADMEの選択から本文を生成します。
Issue側で変更したばかりの場合は、最新の本文を指定する方法を使ってください。
