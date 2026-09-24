import React from "react";
import { effortLabels } from "../effort.js";

export default function Composer({
  prompt,
  onPromptChange,
  onSend,
  onStop,
  busy,
  stopDisabled,
  disabled,
  sendDisabled,
  models,
  model,
  effort,
  onModelChange,
  onEffortChange,
  error,
  activity,
  inputRef,
}) {
  const selected = models.find((item) => item.model === model);
  const efforts = selected?.supportedReasoningEfforts || [];
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
        <div className="composer-input-row">
          <div className="prompt-box">
            <input
              id="prompt"
              ref={inputRef}
              type="text"
              maxLength="16000"
              placeholder="メッセージを入力…"
              aria-label="メッセージ"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              disabled={disabled}
            />
          </div>
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
        <div className="composer-footer">
          <div className="composer-settings">
            <label htmlFor="model">
              モデル
              <select
                id="model"
                value={model}
                onChange={(event) => onModelChange(event.target.value)}
                disabled={disabled || busy}
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
              推論レベル
              <select
                id="effort"
                value={effort}
                onChange={(event) => onEffortChange(event.target.value)}
                disabled={disabled || busy || !effort}
              >
                {!efforts.length && <option value="">指定なし</option>}
                {efforts.map((option) => {
                  const value = option.reasoningEffort;
                  return (
                    <option
                      key={value}
                      value={value}
                      title={option.description}
                    >
                      {effortLabels[value] || value} ({value})
                      {value === selected.defaultReasoningEffort
                        ? " · 標準"
                        : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        </div>
      </form>
      <p className="footnote">Codex と、一つずつ考えよう。</p>
    </div>
  );
}
