import React, { useEffect, useRef, useState } from "react";
import { getJson, post, streamEvents } from "./api.js";
import Sidebar from "./components/Sidebar.jsx";
import Conversation from "./components/Conversation.jsx";
import Composer from "./components/Composer.jsx";

function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function defaultEffort(model) {
  const options = model?.supportedReasoningEfforts || [];
  const saved = readPreference(`codex-chat-effort:${model?.model}`);
  return (
    options.find((item) => item.reasoningEffort === saved)?.reasoningEffort ||
    options.find(
      (item) => item.reasoningEffort === model?.defaultReasoningEffort,
    )?.reasoningEffort ||
    options[0]?.reasoningEffort ||
    ""
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia?.("(max-width: 600px)").matches,
  );
  const [connected, setConnected] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [conversations, setConversations] = useState([]);
  const [usage, setUsage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [activity, setActivity] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [stopDisabled, setStopDisabled] = useState(false);
  const busyRef = useRef(false);
  const switchingRef = useRef(false);
  const viewRef = useRef(null);
  const inputRef = useRef(null);
  const sidebarRef = useRef(null);
  const toggleRef = useRef(null);
  const followOutput = useRef(true);

  function changeSidebar(open) {
    if (!open && sidebarRef.current?.contains(document.activeElement))
      toggleRef.current?.focus();
    setSidebarOpen(open);
  }
  async function refreshHistory() {
    const data = await getJson("/api/history");
    setConversations(data.conversations);
    return data.conversations;
  }
  async function refreshUsage() {
    try {
      setUsage(await getJson("/api/usage"));
    } catch {
      setUsage(null);
    }
  }
  async function openConversation(id, availableModels = models) {
    if (busyRef.current || switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    try {
      const data = await (await post("/api/open", {}, id)).json();
      setSessionId(data.sessionId);
      savePreference("codex-chat-active", data.sessionId);
      setMessages(data.messages);
      setPrompt("");
      setActivity("");
      setError("");
      const selected = availableModels.find(
        (item) => item.model === data.model,
      );
      if (selected) {
        setModel(selected.model);
        setEffort(
          selected.supportedReasoningEfforts?.some(
            (item) => item.reasoningEffort === data.effort,
          )
            ? data.effort
            : defaultEffort(selected),
        );
      }
      followOutput.current = true;
      if (window.matchMedia?.("(max-width: 600px)").matches)
        changeSidebar(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }
  async function newChat() {
    if (busyRef.current || switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    try {
      const data = await (await post("/api/reset", {}, sessionId)).json();
      setSessionId(data.sessionId);
      savePreference("codex-chat-active", data.sessionId);
      setMessages([]);
      setPrompt("");
      setActivity("");
      setError("");
      await refreshHistory();
      followOutput.current = true;
      inputRef.current?.focus();
    } catch (cause) {
      setError(cause.message);
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }
  async function deleteConversation(chat) {
    if (busyRef.current || switchingRef.current) return;
    if (
      !window.confirm(
        `「${chat.title}」を削除しますか？この操作は取り消せません。`,
      )
    )
      return;
    switchingRef.current = true;
    setSwitching(true);
    try {
      await post("/api/delete", {}, chat.id);
      if (chat.id === sessionId) {
        setSessionId("");
        savePreference("codex-chat-active", "");
        setMessages([]);
        setPrompt("");
        setActivity("");
        const data = await (await post("/api/reset", {}, "")).json();
        setSessionId(data.sessionId);
        savePreference("codex-chat-active", data.sessionId);
        followOutput.current = true;
      }
      await refreshHistory();
      setError("");
    } catch (cause) {
      setError(cause.message);
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }
  useEffect(() => {
    refreshUsage();
    const interval = setInterval(refreshUsage, 60_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    async function bootstrap() {
      try {
        const data = await getJson("/api/bootstrap");
        setModels(data.models);
        setAuthenticated(data.authenticated && data.models.length > 0);
        setConnected(true);
        const selected =
          data.models.find(
            (item) => item.model === readPreference("codex-chat-model"),
          ) ||
          data.models.find((item) => item.isDefault) ||
          data.models[0];
        setModel(selected?.model || "");
        setEffort(defaultEffort(selected));
        const history = await refreshHistory();
        const active = readPreference("codex-chat-active");
        if (history.some((item) => item.id === active))
          await openConversation(active, data.models);
        else await newChat();
        if (!data.authenticated)
          setError(
            "ターミナルで codex login を実行し、ページを再読み込みしてください。",
          );
        else if (!data.models.length)
          setError(
            "利用できるモデルがありません。Codex の設定を確認してください。",
          );
      } catch (cause) {
        setConnected(false);
        setError(cause.message);
      }
    }
    bootstrap();
  }, []);
  useEffect(() => {
    if (followOutput.current && viewRef.current)
      viewRef.current.scrollTop = viewRef.current.scrollHeight;
  }, [messages]);
  function changeModel(value) {
    setModel(value);
    savePreference("codex-chat-model", value);
    setEffort(defaultEffort(models.find((item) => item.model === value)));
  }
  function changeEffort(value) {
    setEffort(value);
    savePreference(`codex-chat-effort:${model}`, value);
  }
  async function sendMessage() {
    const text = prompt.trim();
    if (
      !text ||
      busyRef.current ||
      switchingRef.current ||
      !authenticated ||
      !sessionId ||
      !model
    )
      return;
    const selectedModel = model;
    const selectedEffort = effort;
    const currentSession = sessionId;
    const label =
      models.find((item) => item.model === model)?.displayName || model;
    busyRef.current = true;
    setBusy(true);
    setStopDisabled(false);
    setError("");
    setActivity("考えています…");
    setPrompt("");
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    followOutput.current = true;
    let done = false,
      output = false;
    try {
      const response = await post(
        "/api/chat",
        {
          text,
          model: selectedModel,
          ...(selectedEffort ? { effort: selectedEffort } : {}),
        },
        currentSession,
      );
      for await (const event of streamEvents(response)) {
        if (event.type === "delta" || event.type === "message") {
          const view = viewRef.current;
          followOutput.current =
            !view ||
            view.scrollHeight - view.scrollTop - view.clientHeight < 100;
          setMessages((previous) => {
            const index = previous.findIndex((item) => item.id === event.id);
            const value =
              event.type === "message"
                ? event.text
                : (index < 0 ? "" : previous[index].text) + event.text;
            if (index < 0)
              return [
                ...previous,
                {
                  id: event.id,
                  role: "assistant",
                  text: value,
                  label,
                  effort: selectedEffort,
                },
              ];
            return previous.map((item, position) =>
              position === index ? { ...item, text: value } : item,
            );
          });
          output = true;
          setActivity("回答を生成中…");
        }
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "done") {
          done = true;
          if (event.error || event.status === "failed")
            throw new Error(event.error || "回答の生成に失敗しました。");
          setActivity(
            event.status === "interrupted"
              ? "生成を停止しました。"
              : output
                ? ""
                : "テキストの回答はありませんでした。",
          );
        }
      }
      if (!done) throw new Error("接続が切れました。もう一度お試しください。");
    } catch (cause) {
      setError(cause.message);
      setActivity("");
      if (!output) setPrompt((current) => current || text);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setStopDisabled(false);
      inputRef.current?.focus();
      refreshHistory().catch((cause) => setError(cause.message));
      refreshUsage();
    }
  }
  async function stop() {
    setStopDisabled(true);
    try {
      await post("/api/stop", {}, sessionId);
    } catch (cause) {
      setError(cause.message);
      setStopDisabled(false);
    }
  }

  return (
    <div className={`workspace${sidebarOpen ? " sidebar-open" : ""}`}>
      <Sidebar
        sidebarRef={sidebarRef}
        authenticated={authenticated}
        connected={connected}
        usage={usage}
        conversations={conversations}
        sessionId={sessionId}
        disabled={busy || switching}
        busy={busy}
        onNewChat={newChat}
        onOpen={openConversation}
        onDelete={deleteConversation}
      />
      <button
        id="sidebar-toggle"
        ref={toggleRef}
        type="button"
        aria-label={sidebarOpen ? "サイドバーを閉じる" : "サイドバーを開く"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
        onClick={() => changeSidebar(!sidebarOpen)}
      >
        {sidebarOpen ? "×" : "☰"}
      </button>
      <main>
        <Conversation
          messages={messages}
          onSuggestion={(value) => {
            setPrompt(value);
            inputRef.current?.focus();
          }}
          onError={setError}
          viewRef={viewRef}
        />
        <Composer
          prompt={prompt}
          onPromptChange={setPrompt}
          onSend={sendMessage}
          onStop={stop}
          busy={busy}
          stopDisabled={stopDisabled}
          disabled={!authenticated || switching}
          models={models}
          model={model}
          effort={effort}
          onModelChange={changeModel}
          onEffortChange={changeEffort}
          sendDisabled={
            !authenticated ||
            busy ||
            switching ||
            !sessionId ||
            !prompt.trim() ||
            !model
          }
          error={error}
          activity={activity}
          inputRef={inputRef}
        />
      </main>
    </div>
  );
}
