# Stage 1: Build the frontend
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Final production image
FROM node:20-slim

WORKDIR /app

# Install system dependencies (ffmpeg and others)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy the built frontend from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the server code
COPY server ./server

# Ensure the data directory exists and has correct permissions
RUN mkdir -p /app/data && chmod -R 777 /app/data

# Environment variables
ENV PORT=3001
ENV DB_PATH=/app/data/database.sqlite
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
