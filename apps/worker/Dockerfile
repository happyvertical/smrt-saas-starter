FROM node:24.18.0-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY .runtime/worker/ ./
USER 1000:1000
CMD ["node", "dist/index.js"]
