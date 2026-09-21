FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json LICENSE ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html archive-render.html ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY public ./public
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310
COPY --from=build /app/package.json /app/package-lock.json /app/LICENSE ./
# tsx is the small runtime compiler; dev dependencies are retained in this prototype image.
RUN npm ci --include=dev
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg && rm -rf /var/lib/apt/lists/*
ENV ARCHIVE_CHROMIUM_PATH=/usr/bin/chromium
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
RUN mkdir -p /app/data && chown node:node /app/data
COPY scripts/migrate-archive.ts ./scripts/migrate-archive.ts
USER node
EXPOSE 4310
CMD ["npm", "start"]
