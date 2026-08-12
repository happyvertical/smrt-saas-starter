FROM node:24.18.0-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Deploy workflows pass the commit SHA; /api/health reports it so pipelines
# can wait for the rollout to actually serve the build they shipped.
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION
COPY .runtime/web/ ./
EXPOSE 3000
USER 1000:1000
CMD ["node", "scripts/smrt-start.mjs"]
