# WITH-AI

Google Meet の字幕をリアルタイムに取得し、AI で自動要約・質問抽出を行う Chrome 拡張機能。

## 主な機能

- **自動要約（30秒ごと）** — Meet の字幕を取得し、Gemini / OpenAI / Claude のいずれかで要約。要点は最大5点、発言者名も抽出。
- **概要の生成** — 各要約に2〜3文の全体概要を併記。
- **質問の自動抽出** — 会議中の質問を検出し、回答候補をセットで表示。「AIで回答」ボタンで再生成も可能。
- **会話ログ** — API に送信した単位で会話を記録（送信済みの内容は再送しない設計）。
- **タイムライン表示** — サマリー・質問・会話ログすべてが時系列に並ぶ Side Panel UI。
- **デバッグログ** — API キーの先頭、発火タイミング、エラーメッセージまで可視化。

## 技術スタック

- [Plasmo](https://www.plasmo.com/) — Chrome 拡張フレームワーク
- React 19 + TypeScript
- Tailwind CSS v3 + OKLCH カラートークン
- Chrome MV3（`chrome.storage.session`、`chrome.alarms`、`chrome.sidePanel`、`chrome.scripting`）
- AI SDK: `@google/genai` / `openai` / `@anthropic-ai/sdk`

## 対応 AI プロバイダー

| プロバイダー | 推奨モデル | 備考 |
|------------|----------|------|
| Google Gemini | `gemini-2.0-flash-lite` | 高速・低コスト |
| OpenAI | `gpt-4o-mini` | 安定 |
| Anthropic Claude | `claude-haiku-4-5-20251001` | 高品質 |

## セットアップ

### 1. ビルド

```bash
pnpm install
pnpm build
```

出力は `build/chrome-mv3-prod/` に生成される。

### 2. Chrome に読み込み

1. Chrome で `chrome://extensions/` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」→ `build/chrome-mv3-prod/` を選択

### 3. API キー設定

1. 拡張機能アイコンを右クリック → 「オプション」
2. プロバイダー選択 → 対応する API キーを入力 → モデル選択 → 保存

## 使い方

1. Google Meet を開く（**必ず拡張機能の読み込み後に Meet タブを開く／再読み込みする**）
2. ツールバーの WITH-AI アイコンをクリックして Side Panel を開く
3. 画面下部の「CC（字幕を表示）」を ON にする
4. Side Panel の「AIアシスタント 稼働中」スイッチを ON → 字幕状態の自動確認が走る
5. 30秒ごとに要約が自動生成される。「今すぐ分析」ボタンで手動発火も可能。

## Side Panel のタブ構成

- **要約・Q&A** — 時系列タイムライン（要約カード + 質問カード）
- **会話ログ** — API に送信した会話チャンクのみ表示（区切りマーカーあり）
- **デバッグ** — 起動・タイマー・API 呼び出し・エラーログ

## プロジェクト構成

```
with-ai/
├── assets/                       # アイコン等
├── background/index.ts           # Service Worker: タイマー / 要約 / 状態管理
├── contents/meet-caption.ts      # Content Script: Meet DOM 観測
├── sidepanel/index.tsx           # Side Panel UI（メインビュー）
├── options/index.tsx             # API キー・モデル設定画面
├── components/
│   ├── StatusBar.tsx             # 取得状況・カウントダウン表示
│   └── SummarySection.tsx        # タイムライン（要約・質問カード）
├── lib/
│   ├── ai/
│   │   ├── types.ts              # AIProvider 共通型 / プロンプト
│   │   ├── gemini.ts             # Gemini 実装
│   │   ├── openai.ts             # OpenAI 実装
│   │   ├── claude.ts             # Claude 実装
│   │   └── index.ts              # プロバイダーファクトリ
│   ├── storage.ts                # chrome.storage.local ラッパー
│   └── utils.ts                  # cn() 他
├── messages/types.ts             # CS/BG/SP 間メッセージ型定義
├── styles/globals.css            # Tailwind + OKLCH トークン
├── package.json                  # Plasmo manifest / 依存関係
└── README.md
```

## Chrome 拡張機能の権限

`package.json` の `manifest` で宣言:

| 権限 | 用途 |
|------|------|
| `storage` | API キー・設定の永続化（`chrome.storage.local`） |
| `sidePanel` | Side Panel UI 表示 |
| `activeTab` | アクティブタブ取得 |
| `alarms` | 30秒タイマー |
| `scripting` | コンテンツスクリプト未注入時のフォールバック字幕検出 |
| `tabs` | Meet タブの検索・再読み込み |
| `host_permissions: https://meet.google.com/*` | Meet DOM アクセス |

## アーキテクチャ

```
┌────────────────────┐
│  Google Meet DOM   │
│  (caption area)    │
└─────────┬──────────┘
          │ MutationObserver / polling
          ▼
┌────────────────────┐
│  Content Script    │  meet-caption.ts
│  - 字幕抽出        │
│  - ノイズ除去       │
│  - 最新行のみ送信  │
└─────────┬──────────┘
          │ NEW_CAPTION
          ▼
┌────────────────────┐
│  Background (SW)   │  background/index.ts
│  - transcript蓄積  │◄──── chrome.storage.session
│  - 消費プレフィックス│       (consumedPrefix永続化)
│  - 30秒タイマー    │
│  - AI API 呼び出し │
└─────────┬──────────┘
          │ SUMMARY_UPDATE / QUESTION_DETECTED / STATE_RESPONSE
          ▼
┌────────────────────┐
│  Side Panel (React)│  sidepanel/index.tsx
│  - タイムライン表示│
│  - 会話ログ        │
│  - デバッグログ    │
└────────────────────┘
```

### 会話履歴の区切り仕様

1. 字幕（Meet の caption DOM）は**累積的に伸びていく1つのテキスト**
2. 要約 API に送信したら `consumedPrefix`（送信済みテキスト全体）を記録
3. 次のキャプチャは `consumedPrefix` との最長共通プレフィックス（LCP）を差し引き、**新しい差分のみ**を state.transcript に入れる
4. → 次回の API 送信も差分のみ。トークンを無駄にしない
5. `consumedPrefix` は `chrome.storage.session` に永続化され SW 再起動に耐える

### 同一発話判定（sameUtterance）

Meet の ML が字幕を遡って書き換えるため、単純な include/startsWith ではマッチしないケースがある。以下のいずれかで同一発話とみなす:

- 完全一致
- 片方が他方を包含
- 先頭30文字が一致（ML の末尾書き換えに耐性）

## レート制限について

- API 呼び出しは原則 **30秒に1回**（タイマー）
- 手動「今すぐ分析」は MIN_INTERVAL を無視して即実行
- 同時実行防止ロック `isSummaryRunning` あり
- 429 エラー時は追加50秒クールダウンを付与

Gemini Tier 3 等の有料プランを使っていても 429 が頻発する場合、**デバッグログに表示される API キー先頭8文字**が実際のプロジェクトと一致しているか確認してください。別プロジェクト（無料枠）のキーが誤って入っている可能性があります。

## 開発

```bash
# 開発ビルド（ホットリロード）
pnpm dev

# 本番ビルド
pnpm build

# パッケージ化（zip 作成）
pnpm package
```

## 既知の制約

- Meet の字幕 DOM 構造変更に影響を受ける（セレクタは複数フォールバック実装済み）
- 拡張機能を更新した後は**既存の Meet タブをリロード必須**（古い Content Script が注入されたまま）
- Service Worker は MV3 仕様で休止する。字幕がない時間が長いと `consumedPrefix` がメモリからは消えるが、`chrome.storage.session` で復元される

## ライセンス

Private use only.
