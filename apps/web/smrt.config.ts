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
  },
};
