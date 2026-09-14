# Stage 1: Dependencies

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build 

# Stage 3: Runner
FROM node:22-alpine AS runner 
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup 

# Leverage standalone output (skips the massive node_modules completely)
COPY --from=builder --chown=appuser:appgroup /app/public ./public
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static

USER appuser
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Standalone mode generates its own optimized server.js
CMD ["node", "server.js"]
 

