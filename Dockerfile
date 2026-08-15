FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm install
COPY backend backend
COPY frontend frontend
RUN npm run build --workspace frontend && npm run build --workspace backend

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
RUN mkdir -p /app/data/music /app/data/uploads
EXPOSE 3000
CMD ["node","backend/dist/index.js"]
