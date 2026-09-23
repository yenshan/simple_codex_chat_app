async function expectJson(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

export function getJson(path) {
  return fetch(path).then(expectJson);
}

export async function post(path, body, sessionId) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId || "",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "通信に失敗しました。");
  }
  return response;
}

export async function* streamEvents(response) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}
