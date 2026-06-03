# ============================================================================
# HUX PROP FIRM - PRODUCTION DOCKERFILE CONFIG
# Multi-stage Docker environment for node backend microservices.
# ============================================================================

# STAGE 1: Builder Layer
FROM node:18-alpine AS builder

# Set active working directory
WORKDIR /usr/src/app

# Copy dependency configs
COPY package*.json ./

# Install packages including build-essential tools
RUN npm ci

# Copy full application codes
COPY . .

# STAGE 2: Lightweight Production runner
FROM node:18-alpine AS runner

# Optimize for production
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy node packages from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app ./

# Setup security privileges - run under non-root node user
USER node

# Expose HTTP API and low-latency WebSocket ports
EXPOSE 8080

# Configure environment defaults
ENV PORT=8080
ENV JWT_SECRET=HUX_FUTURISTIC_SECURE_KEY

# Launch the microservice entry point
CMD ["node", "services/websocket.js"]
