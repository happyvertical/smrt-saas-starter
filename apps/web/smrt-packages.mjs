export const smrtRuntimePackages = [
  "@happyvertical/smrt-agents",
  "@happyvertical/smrt-analytics",
  "@happyvertical/smrt-app-mcp",
  "@happyvertical/smrt-assets",
  "@happyvertical/smrt-chat",
  "@happyvertical/smrt-commerce",
  "@happyvertical/smrt-content",
  "@happyvertical/smrt-features",
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

export async function registerSmrtRuntimePackages() {
  for (const packageName of smrtRuntimePackages) {
    await import(packageName);
  }
}
