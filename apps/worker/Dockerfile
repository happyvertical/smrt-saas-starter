FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY apps/worker/dist ./dist
COPY apps/worker/package.json ./package.json
CMD ["node", "dist/index.js"]
