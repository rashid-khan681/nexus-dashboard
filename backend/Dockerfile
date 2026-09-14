# ---------- Stage 1: Builder ----------

FROM node:22-alpine AS builder 
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# ---------- Stage 2: Production ----------
FROM node:22-alpine

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup 

WORKDIR /app

# Copy only the built artifacts from builder
COPY --from=builder /app .

# Switch active execution context to non-root user
USER appuser

EXPOSE 5000
CMD ["node", "server.js"]


