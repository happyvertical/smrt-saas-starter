import { createLogger } from "@happyvertical/logger";
import { runWorkerCycle } from "./jobs.js";

const logLevel =
  process.env.LOG_LEVEL === "debug"
    ? "debug"
    : process.env.LOG_LEVEL === "error"
      ? "error"
      : "info";
const logger = createLogger({ level: logLevel });

export async function main(): Promise<void> {
  const results = await runWorkerCycle({ logger });
  for (const result of results) {
    logger.info("Worker job complete", { ...result });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Worker failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}
