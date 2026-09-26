import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain Node server module
import { evaluate, parseResult, dimensions } from "../server-analysis.mjs";
function response() {
  return {
    model: "jev-test",
    answers: Object.fromEntries(
      Object.keys(dimensions).map((id) => [
        id,
        { type: "score", score: 2, confidence: 0.8, probabilities: { "2": 1 } },
      ]),
    ),
    usage: { input_tokens: 10 },
  };
}
test("normalizes intensity independently from confidence and retains raw response", () => {
  const result = parseResult(response());
  assert.equal(result.scores.joy, 0.5);
  assert.equal(result.confidence.joy, 0.8);
  assert.equal(result.raw.usage.input_tokens, 10);
});
test("rejects missing, out of range and nonfinite model results", () => {
  assert.throws(() => parseResult({}));
  for (const score of [-1, 5, NaN, Infinity]) {
    const input = response();
    input.answers.joy.score = score;
    assert.throws(() => parseResult(input));
  }
});
test("sends eight Score questions and keeps API credential in authorization header", async () => {
  const result = await evaluate(
    "A quiet morning.",
    "test-secret",
    new AbortController().signal,
    async (url: string, init: RequestInit) => {
      assert.equal(url, "https://api.typesafe.ai/v1/systemone");
      assert.equal(
        (init.headers as Record<string, string>).Authorization,
        "Bearer test-secret",
      );
      const body = JSON.parse(init.body as string);
      assert.equal(body.state.text, "A quiet morning.");
      assert.equal(Object.keys(body.questions).length, 8);
      assert.ok(!JSON.stringify(body).includes("test-secret"));
      return new Response(JSON.stringify(response()), { status: 200 });
    },
  );
  assert.equal(result.scores.joy, 0.5);
});
test("handles authentication failure without exposing upstream content", async () => {
  await assert.rejects(
    () =>
      evaluate(
        "x",
        "test",
        new AbortController().signal,
        async () => new Response("private upstream content", { status: 401 }),
      ),
    /Ключ TypeSafe не принят/,
  );
});
