# Codex Chat

Codex app-server を使う、ローカル向けのシンプルな日本語 Web チャットです。

## 起動

Node.js 22.12 以上と Codex CLI が必要です。Codex CLI のログイン情報・プロバイダー設定を利用します。

```sh
git clone https://github.com/yenshan/simple_codex_chat_app.git
cd simple_codex_chat_app
codex login
npm ci
npm start
```

http://127.0.0.1:8087 を開きます。`npm start` は画面をビルドしてからサーバーを起動します。
すでに Codex にログイン済みなら `codex login` は不要です。

```sh
PORT=3000 npm start
CODEX_BIN=/absolute/path/to/codex npm start
npm test
```

開発中は `npm run dev` を実行します。Codex app-server とローカル API の準備ができてから Vite を起動し、http://localhost:5173 をブラウザで自動的に開きます。Vite が画面を更新し、API リクエストを Node サーバーへ転送します。`Ctrl+C` でこのコマンドが起動したプロセスを終了します。`npm run build` だけを実行すると `dist/` に配信用ファイルを生成できます。

## 機能

- app-server の `model/list` からモデル一覧を取得し、選択をブラウザに保存
- 会話の途中でもモデルを変更可能（次の送信から適用）
- モデルが対応する推論レベルを選択可能。初期値はモデルの標準値で、選択はモデルごとにブラウザへ保存（次の送信から適用）
- サイドバーの接続状態の下に Codex の 5 時間枠と週次枠の残量を表示（取得できない枠は「—」）
- 回答のストリーミング表示、コピー、生成停止、新しい会話
- Markdown 表示（見出し・リスト・表・引用・コードブロック・リンク）と数式表示。コピーは元の Markdown を取得
- 開閉できる履歴サイドバーから過去の会話を表示・再開。各項目の「…」メニューから確認後に削除可能
- 一行の入力欄から Enter で送信。モデルと推論レベルは入力欄の右下で選択
- ログイン不足・接続失敗・生成エラーを画面に表示

## 構成

画面は React コンポーネントで構成し、Vite でビルドします。`src/App.jsx` が会話状態と操作を管理し、`src/components/` がサイドバー・会話・入力欄を描画します。`src/api.js` に API 通信、`src/markdown.js` に Markdown と数式の変換をまとめています。

`server.js` がビルド済みの画面とローカル HTTP API を提供し、`codex.js` が `codex app-server` を子プロセスとして起動します。JSONL の initialize → initialized → thread/start → turn/start で通信し、ブラウザには fetch の NDJSON ストリームで回答を渡します。API キーやログイントークンをブラウザへ渡しません。

会話の一覧・メッセージは `.data/history/` にチャットIDごとの JSON ファイルとして保存し、Codex の永続スレッドと紐付けます。従来の `.data/history.json` は起動時に自動移行し、移行後は `.data/history.json.migrated-*` としてバックアップします。ページの再読み込み・サーバー再起動後も履歴を開き、続きを送信できます。保存した履歴はこのローカルアプリのブラウザ間で共有されます。生成中は会話の切り替えを無効にします。以前のバージョンで作成した一時会話は復元できません。モデル一覧はアカウントと Codex 設定に依存します。

履歴の削除はローカルに保存した会話と対応する Codex スレッドを完全に削除します。生成中の会話は削除できません。

Markdown は [Marked](https://marked.js.org/) で変換し、[DOMPurify](https://github.com/cure53/DOMPurify) で許可した要素・属性だけに制限します。数式は [KaTeX](https://katex.org/) で表示し、インラインの `$...$` と `\\(...\\)`、別行の `$$...$$` と `\\[...\\]` に対応します。スクリプト・イベント属性・危険なリンクは除去し、外部画像は読み込みません。依存ファイルはローカル配信します。

localhost 専用で、127.0.0.1 にバインドし Host と Origin を検証します。スレッドは read-only / approvalPolicy: never で作成します。このアプリは対話的なツール承認には対応していません。公開ホスティング用の認証機能は含みません。

公式仕様: [Codex App Server](https://developers.openai.com/codex/app-server)
