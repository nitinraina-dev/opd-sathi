# OPD Saathi: one container with the Express API serving the built React app.
#   docker build -t opd-saathi .
#   docker run -p 5050:5050 -e MONGODB_URI=mongodb://host.docker.internal:27017/opd-saathi opd-saathi
# Or use docker-compose.yml, which also starts MongoDB.

# 1. Build the React app.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build

# 2. Run the server. It also uses the shared rules in client/src (plain JS).
FROM node:22-alpine
WORKDIR /app
# The hospital's own time zone (breaks, bookings and the forecast use the server's clock).
RUN apk add --no-cache tzdata
ENV NODE_ENV=production PORT=5050 TZ=Asia/Kolkata
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY client/src client/src
COPY --from=build /app/client/dist client/dist
RUN mkdir -p server/data && chown node server/data
USER node
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:5050/api/health || exit 1
CMD ["node", "server/src/index.js"]
