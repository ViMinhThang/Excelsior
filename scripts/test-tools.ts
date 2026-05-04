import { loadConfig } from "../src/infra/config.js";
import { createAgentProvider } from "../src/core/llm/runtime/index.js";

/**
 * SCRATCH SCRIPT: Test Tool Support
 *
 * Run with: npx tsx scratch/test-tools.ts
 */
async function testToolSupport() {
  const config = loadConfig();
  const provider = createAgentProvider(config);

  if (!provider) {
    console.error(
      "❌ No provider configured. Please check your .env or excelsior.json",
    );
    process.exit(1);
  }

  console.log(`🚀 Testing Provider: ${provider.label}`);
  console.log(`🤖 Active Model:    ${provider.model}`);
  console.log("--------------------------------------------------\n");

  try {
    console.log("⏳ Sending tool-enabled prompt...");

    const result = await provider.runTurn({
      systemPrompt:
        "You are a helpful assistant. You MUST use the 'list_files' tool to answer the user's request.",
      prompt:
        "Show me the files in the current directory using the list_files tool.",
      cwd: process.cwd(),
      tools: ["list_files"],
      maxSteps: 2,
    });

    console.log("\n--- Model Output ---");
    console.log(result);
    console.log("--------------------\n");

    console.log("✅ Verification Complete.");
  } catch (error: any) {
    console.error("\n❌ VERIFICATION FAILED!");
    console.log("\nError Message:", error.message);
  }
}

testToolSupport().catch(console.error);
