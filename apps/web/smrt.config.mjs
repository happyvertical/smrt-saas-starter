export default {
  smrt: {
    logLevel: "info",
    schemaMigration: {
      strategy: "auto-add",
    },
  },
  knowledge: {
    enabled: true,
    api: {
      enabled: false,
      basePath: "/__smrt/knowledge",
      requireAdmin: true,
      includeDocs: false,
      includePrompts: false,
    },
  },
  packages: {
    cli: {
      database: {
        type: "postgres",
        url: process.env.DATABASE_URL,
      },
      verbose: false,
    },
    users: {
      // hooks.server loads this file through starter-config.ts before any auth
      // route constructs an OIDC handler. Keep provider config in this canonical
      // starter template rather than initializing it lazily from feature modules.
      auth: {
        oidc: {
          defaultProvider: "happyvertical",
          providers: {
            happyvertical: {
              issuer: process.env.HAPPYVERTICAL_IDP_ISSUER,
              clientId: process.env.OIDC_CLIENT_ID,
              clientSecret: process.env.OIDC_CLIENT_SECRET,
            },
          },
        },
      },
    },
    prompts: {
      profiles: {
        default: {
          provider: process.env.AI_PROVIDER ?? "openai",
          model: process.env.AI_MODEL ?? "gpt-4o-mini",
          params: {
            temperature: 0.2,
          },
        },
      },
      allowedProfileNames: ["default"],
    },
    languages: {
      defaultLocale: "en",
      supportedLocales: ["en", "fr-CA"],
      translationBudgetPerTenantPerDay: 100,
    },
  },
};
