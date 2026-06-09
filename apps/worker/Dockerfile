FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY .runtime/worker/ ./
USER node
CMD ["node", "dist/index.js"]
