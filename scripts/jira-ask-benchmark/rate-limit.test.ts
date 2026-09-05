import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backoffMs, SlidingWindowLimiter } from "./rate-limit";

describe("SlidingWindowLimiter", () => {
  it("waits when the window is full, then proceeds", async () => {
    let now = 1_000;
    const sleeps: number[] = [];
    const limiter = new SlidingWindowLimiter(
      2,
      1_000,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    );
    await limiter.acquire();
    await limiter.acquire();
    const third = await limiter.acquire();
    assert.ok(third.waited_ms >= 1000);
    assert.ok(sleeps.length >= 1);
  });
});

describe("backoffMs", () => {
  it("doubles from 1s and caps at 16s", () => {
    assert.equal(backoffMs(0), 1000);
    assert.equal(backoffMs(1), 2000);
    assert.equal(backoffMs(4), 16000);
    assert.equal(backoffMs(8), 16000);
  });
});
