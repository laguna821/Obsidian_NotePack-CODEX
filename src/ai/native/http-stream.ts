import { requireNode } from "./process";

/** Desktop HTTPS streaming avoids renderer CORS. No redirects or credential logging. */
export function requestPublicTextStream(request: {
  url: string; headers: Record<string, string>; body: string; signal?: AbortSignal;
  onTextDelta: (delta: string) => void;
}): Promise<{ status: number; text: string }> {
  request.signal?.throwIfAborted();
  const https = requireNode<typeof import("https")>("https");
  const { StringDecoder } = requireNode<typeof import("string_decoder")>("string_decoder");
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let text = "", pending = "", bytes = 0;
    const req = https.request(request.url, { method: "POST", headers: { ...request.headers, "Content-Type": "application/json" } }, res => {
      const status = res.statusCode ?? 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 8_000_000) { req.destroy(new Error("AI response exceeded the stream limit")); return; }
        const decoded = decoder.write(chunk); text += decoded; pending += decoded;
        let newline: number;
        while ((newline = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, newline).trimEnd(); pending = pending.slice(newline + 1);
          if (status >= 400 || !line.startsWith("data:")) continue;
          let event: { type?: string; delta?: unknown };
          try { event = JSON.parse(line.slice(5).trimStart()); } catch { continue; }
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") request.onTextDelta(event.delta);
        }
      });
      res.on("end", () => { text += decoder.end(); resolve({ status, text }); });
      res.on("error", reject);
      res.on("aborted", () => reject(new Error("AI response stream was interrupted")));
    });
    const abort = () => req.destroy(new DOMException("Request aborted", "AbortError"));
    request.signal?.addEventListener("abort", abort, { once: true });
    req.on("close", () => request.signal?.removeEventListener("abort", abort));
    req.on("error", reject);
    req.setTimeout(240_000, () => req.destroy(new Error("AI response stream timed out")));
    if (request.signal?.aborted) abort(); else req.end(request.body);
  });
}
