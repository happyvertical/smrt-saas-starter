FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY .runtime/web/ ./
EXPOSE 3000
USER node
CMD ["node", "build"]
