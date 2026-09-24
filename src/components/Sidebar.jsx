import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function Sidebar({
  sidebarRef,
  authenticated,
  connected,
  conversations,
  sessionId,
  disabled,
  busy,
  onNewChat,
  onOpen,
  onDelete,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!openMenu) return;
    const closeOutside = (event) => {
      if (
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      )
        setOpenMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        triggerRef.current?.focus();
      }
    };
    const close = () => setOpenMenu(null);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMenu]);
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
          <div
            key={chat.id}
            className={`history-entry${chat.id === sessionId ? " current" : ""}`}
          >
            <button
              className="history-item"
              type="button"
              title={chat.title}
              aria-current={chat.id === sessionId ? "page" : "false"}
              disabled={disabled || busy || chat.busy}
              onClick={() => {
                setOpenMenu(null);
                onOpen(chat.id);
              }}
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
            <button
              className="history-menu-trigger"
              type="button"
              ref={openMenu?.id === chat.id ? triggerRef : null}
              aria-label={`${chat.title}のメニュー`}
              aria-haspopup="menu"
              aria-expanded={openMenu?.id === chat.id}
              disabled={disabled || busy || chat.busy}
              onClick={(event) => {
                if (openMenu?.id === chat.id) return setOpenMenu(null);
                const rect = event.currentTarget.getBoundingClientRect();
                setOpenMenu({
                  id: chat.id,
                  chat,
                  left: Math.max(
                    8,
                    Math.min(rect.right - 112, window.innerWidth - 120),
                  ),
                  top:
                    rect.bottom + 48 > window.innerHeight
                      ? rect.top - 48
                      : rect.bottom + 4,
                });
              }}
            >
              …
            </button>
          </div>
        ))}
      </nav>
      {openMenu &&
        createPortal(
          <div
            className="history-menu"
            role="menu"
            ref={menuRef}
            style={{ left: openMenu.left, top: openMenu.top }}
          >
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => {
                setOpenMenu(null);
                onDelete(openMenu.chat);
              }}
            >
              削除
            </button>
          </div>,
          document.body,
        )}
      <p className="history-note">会話はこの端末に保存されます</p>
    </aside>
  );
}
