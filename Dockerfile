# Multi-stage Dockerfile for IndiraGPT React/Vite Application
# Optimized for AWS App Runner deployment via ECR
# Includes: React Frontend + Express Backend + MongoDB Authentication

# ============================================
# Stage 1: Build the application
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev dependencies needed for build)
# New dependencies: mongodb, bcryptjs, jsonwebtoken, dotenv for authentication
RUN npm ci --legacy-peer-deps

# Copy source code (including data folder for CSV files)
COPY . .

# Build the application for production
# Note: Environment variables (GEMINI_API_KEY, MONGODB_URI, JWT_SECRET) 
# will be injected at runtime via App Runner environment variables
# The vite build plugin automatically copies the data folder to dist/data
RUN npm run build

# ============================================
# Stage 2: Production runtime
# ============================================
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files (including package-lock.json)
COPY package.json package-lock.json ./

# Install only production dependencies
# Includes: express, mongodb, bcryptjs, jsonwebtoken, dotenv
# Excludes: vite, typescript, and other dev dependencies
RUN npm install --omit=dev --legacy-peer-deps && \
    npm cache clean --force

# Copy built application from builder stage
# This includes:
# - dist/ (React app built files)
# - dist/data/ (CSV files copied by vite plugin)
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy server file (Express server with authentication endpoints)
COPY --chown=nodejs:nodejs server.js ./

# Create required directories with proper permissions BEFORE switching user
RUN mkdir -p /app/uploads /app/dist/data && \
    chown -R nodejs:nodejs /app/uploads /app/dist/data

# Switch to non-root user
USER nodejs

# Expose port 8080 (AWS App Runner default port)
EXPOSE 8080

# Environment variables (can be overridden in App Runner)
ENV NODE_ENV=production
ENV PORT=8080

# Required environment variables (set in App Runner):
# - GEMINI_API_KEY: Google Gemini API key
# - MONGODB_URI: MongoDB Atlas connection string
# - JWT_SECRET: Secret key for JWT token signing (optional but recommended)
# - MONGODB_DB_NAME: Database name (optional, defaults to 'indira-gpt')

# Health check endpoint available at /health
# App Runner will automatically use this for health monitoring
# The endpoint returns: { status: 'healthy', hasApiKey: boolean, dbConnected: boolean }

# Start the Express server
# The server:
# 1. Serves static React app files
# 2. Injects GEMINI_API_KEY into HTML at runtime
# 3. Provides API endpoints for authentication (/api/auth/*)
# 4. Provides admin endpoints (/api/admin/*)
# 5. Connects to MongoDB Atlas for user management
CMD ["node", "server.js"]