// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "../src/App.jsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("restores history, streams Markdown and math, and switches conversations", async () => {
  localStorage.setItem("codex-chat-active", "saved");
  window.matchMedia = () => ({ matches: false });
  const calls = [];
  const fetchMock = vi.fn(async (path, options) => {
    calls.push({ path, options });
    const data = {
      "/api/bootstrap": {
        authenticated: true,
        models: [
          {
            model: "test",
            displayName: "Test",
            defaultReasoningEffort: "low",
            supportedReasoningEfforts: [{ reasoningEffort: "low" }],
          },
        ],
      },
      "/api/history": {
        conversations: [
          { id: "saved", title: "以前の会話", updatedAt: Date.now() },
        ],
      },
      "/api/open": {
        sessionId: "saved",
        model: "test",
        effort: "low",
        messages: [
          {
            id: "saved-answer",
            role: "assistant",
            text: "# 保存された見出し\n\n$x^2$",
            label: "Test",
          },
        ],
      },
      "/api/reset": { sessionId: "new" },
    }[path];
    if (path === "/api/chat")
      return new Response(
        [
          { type: "delta", id: "answer", text: "**回答**" },
          {
            type: "message",
            id: "answer",
            text: "**回答**\n\n$$x^2$$\n\n```js\nconst n = 1;\n```",
          },
          { type: "done", status: "completed" },
        ]
          .map((event) => JSON.stringify(event) + "\n")
          .join(""),
      );
    expect(data).toBeTruthy();
    return Response.json(data);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  expect(await screen.findByText("保存された見出し")).toBeTruthy();
  expect(document.querySelector("#sidebar .brand")).toBeTruthy();
  expect(document.querySelector("#messages .katex")).toBeTruthy();
  const toggle = screen.getByRole("button", { name: "サイドバーを閉じる" });
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  fireEvent.change(screen.getByLabelText("メッセージ"), {
    target: { value: "続けて" },
  });
  fireEvent.click(screen.getByRole("button", { name: "メッセージを送信" }));
  await waitFor(() =>
    expect(document.querySelector("#messages strong")?.textContent).toBe(
      "回答",
    ),
  );
  expect(document.querySelector("#messages .katex-display")).toBeTruthy();
  expect(document.querySelector("#messages pre code")?.textContent.trim()).toBe(
    "const n = 1;",
  );
  expect(
    calls.find((call) => call.path === "/api/chat").options.headers[
      "X-Session-Id"
    ],
  ).toBe("saved");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "＋ 新しい会話" }).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "＋ 新しい会話" }));
  expect(await screen.findByText("今日は、何を話しましょう。")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /以前の会話/ }));
  expect(await screen.findByText("保存された見出し")).toBeTruthy();
});

test("starts with the sidebar closed on a narrow screen", async () => {
  window.matchMedia = () => ({ matches: true });
  vi.stubGlobal("fetch", async (path) => {
    const data = {
      "/api/bootstrap": {
        authenticated: true,
        models: [
          {
            model: "test",
            defaultReasoningEffort: "low",
            supportedReasoningEfforts: [{ reasoningEffort: "low" }],
          },
        ],
      },
      "/api/history": { conversations: [] },
      "/api/reset": { sessionId: "new" },
    }[path];
    return Response.json(data);
  });
  render(<App />);
  expect(await screen.findByText("今日は、何を話しましょう。")).toBeTruthy();
  const toggle = screen.getByRole("button", { name: "サイドバーを開く" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

test("switches directly between saved conversations", async () => {
  window.matchMedia = () => ({ matches: false });
  localStorage.setItem("codex-chat-active", "first");
  const calls = [];
  vi.stubGlobal("fetch", async (path, options) => {
    calls.push({ path, options });
    if (path === "/api/bootstrap")
      return Response.json({ authenticated: true, models: [{ model: "test", defaultReasoningEffort: "low", supportedReasoningEfforts: [{ reasoningEffort: "low" }] }] });
    if (path === "/api/history")
      return Response.json({ conversations: [
        { id: "first", title: "最初の会話", updatedAt: Date.now(), busy: false },
        { id: "second", title: "別の会話", updatedAt: Date.now() - 1000, busy: false },
      ] });
    if (path === "/api/open")
      return Response.json({ sessionId: options.headers["X-Session-Id"], model: "test", effort: "low", messages: [
        { id: options.headers["X-Session-Id"], role: "assistant", text: options.headers["X-Session-Id"] === "first" ? "最初の本文" : "別の本文", label: "Test" },
      ] });
    throw new Error(path);
  });
  render(<App />);
  expect(await screen.findByText("最初の本文")).toBeTruthy();
  const second = screen.getByRole("button", { name: /別の会話/ });
  await waitFor(() => expect(second.disabled).toBe(false));
  fireEvent.click(second);
  expect(await screen.findByText("別の本文")).toBeTruthy();
  expect(localStorage.getItem("codex-chat-active")).toBe("second");
  expect(calls.filter(call => call.path === "/api/open").map(call => call.options.headers["X-Session-Id"])).toEqual(["first", "second"]);
});
