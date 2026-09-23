import React from "react";

export default function Composer({
  prompt,
  onPromptChange,
  onSend,
  onStop,
  busy,
  stopDisabled,
  disabled,
  sendDisabled,
  error,
  activity,
  inputRef,
}) {
  return (
    <div className="bottom">
      {error && (
        <div id="error" role="alert">
          {error}
        </div>
      )}
      <div id="activity" role="status">
        {activity}
      </div>
      <form
        id="composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          id="prompt"
          ref={inputRef}
          rows="2"
          maxLength="16000"
          placeholder="メッセージを入力…"
          aria-label="メッセージ"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          disabled={disabled}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
        />
        <div className="composer-footer">
          <span>Enter で送信 · Shift + Enter で改行</span>
          {!busy && (
            <button
              id="send"
              type="submit"
              disabled={sendDisabled}
              aria-label="メッセージを送信"
            >
              ↑
            </button>
          )}
          {busy && (
            <button
              id="stop"
              type="button"
              disabled={stopDisabled}
              onClick={onStop}
            >
              ■ 停止
            </button>
          )}
        </div>
      </form>
      <p className="footnote">Codex と、一つずつ考えよう。</p>
    </div>
  );
}
