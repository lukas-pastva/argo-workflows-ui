# ---------- 1. Build the React front-end ---------- #
FROM node:20-alpine AS client-build

WORKDIR /app/client

# copy manifests first for better layer caching
COPY client/package*.json ./
COPY client/vite.config.js ./

# then the actual sources / public assets
COPY client/src    ./src
COPY client/public ./public

RUN npm install
RUN npm run build          # → creates /app/client/dist


# ---------- 2. Build the server image ---------- #
FROM node:20-alpine AS server

WORKDIR /app/server

# -- add curl so you can run the debug commands printed in the logs --
RUN apk add --no-cache curl

COPY server/package*.json ./
RUN npm install
COPY server .

# ship the compiled front-end with the server
COPY --from=client-build /app/client/dist ./public

ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
