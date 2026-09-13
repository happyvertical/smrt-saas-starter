export const smrtRuntimePackages = [
  "@happyvertical/smrt-saas-objects",
  "@happyvertical/smrt-agents",
  "@happyvertical/smrt-analytics",
  "@happyvertical/smrt-app-mcp",
  "@happyvertical/smrt-assets",
  "@happyvertical/smrt-chat",
  "@happyvertical/smrt-commerce",
  "@happyvertical/smrt-content",
  "@happyvertical/smrt-features",
  "@happyvertical/smrt-fields",
  "@happyvertical/smrt-jobs",
  "@happyvertical/smrt-languages",
  "@happyvertical/smrt-ledgers",
  "@happyvertical/smrt-messages",
  "@happyvertical/smrt-profiles",
  "@happyvertical/smrt-projects",
  "@happyvertical/smrt-prompts",
  "@happyvertical/smrt-secrets",
  "@happyvertical/smrt-sites",
  "@happyvertical/smrt-subscriptions",
  "@happyvertical/smrt-tags",
  "@happyvertical/smrt-tenancy",
  "@happyvertical/smrt-users",
];

// The web app has no decorated source objects of its own. Its generated
// consumer manifest must come from the packaged starter domain provider rather
// than scanning application server/UI source files.
export const smrtConsumerPackages = ["@happyvertical/smrt-saas-objects"];

export async function registerSmrtRuntimePackages() {
  for (const packageName of smrtRuntimePackages) {
    await import(packageName);
  }
}
