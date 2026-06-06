import { createLogger } from "@happyvertical/logger";
import { reconcileSubscriptions } from "./jobs.js";

const logLevel =
  process.env.LOG_LEVEL === "debug"
    ? "debug"
    : process.env.LOG_LEVEL === "error"
      ? "error"
      : "info";
const logger = createLogger({ level: logLevel });

export async function main(): Promise<void> {
  const result = await reconcileSubscriptions();
  logger.info("Worker cycle complete", { ...result });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Worker failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}
