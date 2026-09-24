import React, { useEffect, useRef, useState } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import { renderMarkdown } from "../markdown.js";
import { effortLabels } from "../effort.js";

function Message({ item, onError }) {
  const [copied, setCopied] = useState(false);
  const content = useRef(null);
  const assistant = item.role === "assistant";
  useEffect(() => {
    if (!assistant || !content.current) return;
    content.current.querySelectorAll("a").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    content.current.querySelectorAll("input").forEach((input) => {
      input.type = "checkbox";
      input.disabled = true;
    });
  }, [assistant, item.text]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onError("コピーできませんでした。テキストを選択してコピーしてください。");
    }
  }
  return (
    <article className={`message ${item.role}`}>
      <div className="who">
        {assistant
          ? `Codex · ${item.label} · 推論レベル: ${item.effort ? effortLabels[item.effort] || item.effort : "記録なし"}`
          : "あなた"}
      </div>
      {assistant ? (
        <div
          ref={content}
          className="text"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(item.text, Marked, DOMPurify, katex),
          }}
        />
      ) : (
        <div className="text">{item.text}</div>
      )}
      {assistant && (
        <button className="copy" type="button" onClick={copy}>
          {copied ? "コピーしました" : "コピー"}
        </button>
      )}
    </article>
  );
}

export default function Conversation({
  messages,
  onSuggestion,
  onError,
  viewRef,
}) {
  return (
    <section id="conversation" aria-label="会話" ref={viewRef}>
      <div className="conversation-content">
        {!messages.length && (
          <div id="welcome">
            <div className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</div>
            <h1>今日は、何を話しましょう。</h1>
            <p>
              疑問を解いたり、アイデアを広げたり。
              <br />
              好きなモデルで、気軽に話しかけてください。
            </p>
            <div className="suggestions">
              <button
                type="button"
                onClick={() =>
                  onSuggestion(
                    "新しいWebアプリのアイデアを一緒に考えてください。",
                  )
                }
              >
                <span>✦</span> アイデアを考える <b>↗</b>
              </button>
              <button
                type="button"
                onClick={() =>
                  onSuggestion(
                    "わかりやすい文章を書くためのコツを教えてください。",
                  )
                }
              >
                <span>≋</span> 文章を磨く <b>↗</b>
              </button>
              <button
                type="button"
                onClick={() =>
                  onSuggestion(
                    "プログラミングの学習計画を一緒に考えてください。",
                  )
                }
              >
                <span>⌘</span> コードを学ぶ <b>↗</b>
              </button>
            </div>
          </div>
        )}
        <div
          id="messages"
          role="log"
          aria-label="チャットメッセージ"
          aria-live="polite"
        >
          {messages.map((item) => (
            <Message key={item.id} item={item} onError={onError} />
          ))}
        </div>
      </div>
    </section>
  );
}
