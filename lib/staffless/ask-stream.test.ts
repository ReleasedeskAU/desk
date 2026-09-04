import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forEachNdjsonLine, pipeStafflessAskStream } from "./ask-stream";

describe("forEachNdjsonLine", () => {
  it("yields complete lines including a trailing partial", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":1}\n{"b":'));
        controller.enqueue(new TextEncoder().encode('2}\n'));
        controller.close();
      },
    });
    const lines: string[] = [];
    await forEachNdjsonLine(stream, (line) => lines.push(line));
    assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
  });
});

describe("pipeStafflessAskStream", () => {
  it("emits session, mapped text, and done — never the raw error string", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(
          enc.encode(
            `${JSON.stringify({ obj: { type: "message_delta", content: "Hi" } })}\n`
          )
        );
        controller.enqueue(enc.encode(`${JSON.stringify({ error: "secret traceback" })}\n`));
        controller.close();
      },
    });
    const out = pipeStafflessAskStream(upstream, "sess-1");
    const text = await new Response(out).text();
    assert.match(text, /"type":"session"/);
    assert.match(text, /"type":"text"/);
    assert.match(text, /"type":"done"/);
    assert.equal(text.includes("secret traceback"), false);
  });
});
