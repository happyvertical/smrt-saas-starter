FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY apps/web/build ./build
COPY apps/web/package.json ./package.json
COPY apps/web/smrt.config.mjs ./smrt.config.mjs
EXPOSE 3000
CMD ["node", "build"]
