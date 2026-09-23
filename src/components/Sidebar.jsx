import React from "react";

const effortLabels = {
  none: "なし",
  minimal: "最小",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "非常に高い",
  max: "最大",
  ultra: "Ultra",
};

export default function Sidebar({
  sidebarRef,
  authenticated,
  connected,
  models,
  model,
  effort,
  onModelChange,
  onEffortChange,
  conversations,
  sessionId,
  disabled,
  busy,
  onNewChat,
  onOpen,
}) {
  const selected = models.find((item) => item.model === model);
  const efforts = selected?.supportedReasoningEfforts || [];
  return (
    <aside id="sidebar" ref={sidebarRef} aria-label="設定とチャット履歴">
      <div className="sidebar-head">
        <a className="brand" href="/" aria-label="Codex Chat ホーム">
          <span className="logo">
            c<span>›</span>
          </span>
          Codex <span className="light">Chat</span>
        </a>
      </div>
      <div className="toolbar">
        <span id="connection" role="status">
          {connected === null
            ? "● 接続中"
            : connected
              ? authenticated
                ? "● 接続済み"
                : "○ 接続の準備が必要です"
              : "○ 接続できません"}
        </span>
        <div className="model-settings">
          <label htmlFor="model">
            モデル{" "}
            <select
              id="model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={disabled || !authenticated}
            >
              {!models.length && <option value="">読み込み中…</option>}
              {models.map((item) => (
                <option key={item.model} value={item.model}>
                  {item.displayName || item.model}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="effort">
            推論レベル{" "}
            <select
              id="effort"
              value={effort}
              onChange={(event) => onEffortChange(event.target.value)}
              disabled={disabled || !authenticated || !effort}
            >
              {!efforts.length && <option value="">指定なし</option>}
              {efforts.map((option) => {
                const value = option.reasoningEffort;
                return (
                  <option key={value} value={value} title={option.description}>
                    {effortLabels[value] || value} ({value})
                    {value === selected.defaultReasoningEffort ? " · 標準" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </div>
      <button
        id="new-chat"
        className="secondary"
        disabled={disabled || !authenticated}
        onClick={onNewChat}
      >
        ＋ 新しい会話
      </button>
      <div className="sidebar-heading">チャット履歴</div>
      <nav id="history-list" aria-label="保存した会話">
        {!conversations.length && (
          <p className="history-empty">まだ会話はありません</p>
        )}
        {conversations.map((chat) => (
          <button
            key={chat.id}
            className="history-item"
            type="button"
            title={chat.title}
            aria-current={chat.id === sessionId ? "page" : "false"}
            disabled={disabled || busy || chat.busy}
            onClick={() => onOpen(chat.id)}
          >
            <span>{chat.title}</span>
            <small>
              {new Date(chat.updatedAt).toLocaleString("ja-JP", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </button>
        ))}
      </nav>
      <p className="history-note">会話はこの端末に保存されます</p>
    </aside>
  );
}
