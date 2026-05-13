import { createDeepSeek } from "@ai-sdk/deepseek";
import { getSetting, initDb } from "../src/db/index.js";
import { createAgent } from "../src/agent/agent.js";
import { AgentRun } from "../src/lib/runtime/agentRun.js";
import { streamAgentResponse } from "../src/lib/runtime/agentStream.js";
import { AnyAgentEvent } from "../src/lib/runtime/events.js";

initDb();

const key = getSetting("DEEPSEEK_API_KEY");
console.log("API key configured:", key ? "YES" : "NO");

async function test() {
  const agent = createAgent("You are a helpful assistant. Respond briefly.");
  console.log("Agent created");

  const run = new AgentRun("test_session");
  run.subscribe(() => {
    const events = run.getSnapshot();
    if (events.length > 0) {
      const last = events[events.length - 1];
      console.log("EVENT:", last.type, JSON.stringify(last.data).slice(0, 120));
    }
  });

  console.log("Starting stream...");
  await streamAgentResponse(
    agent,
    [{ role: "user", content: "Say hello" }],
    run
  );
  const allEvents = run.getSnapshot();
  console.log("DONE. Events:", allEvents.length);
  for (const e of allEvents) {
    console.log("  " + e.type);
  }
}

test().catch((e) => {
  console.error("TEST ERROR:", e?.message || e);
  process.exit(1);
});
