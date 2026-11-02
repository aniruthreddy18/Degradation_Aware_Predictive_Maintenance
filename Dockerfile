# ---- build the TanStack Start app for a plain Node server (Lovable's default preset targets Cloudflare)
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=3000 HOST=0.0.0.0 NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
