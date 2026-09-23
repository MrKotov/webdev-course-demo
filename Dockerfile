# One stage is enough: there is no build step and no dependency to compile.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Copied first so the layer is cached while only source changes.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# The SQLite file lives here. Mount a volume over it to keep bookings across deploys.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
# Migrations run at boot from src/server.js, so this is the whole start-up.
CMD ["npm", "start"]
