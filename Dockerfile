# Builder Stage
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the entire working directory
COPY . .

# Install dependencies using pnpm
RUN pnpm install

# Build the applications
RUN pnpm run next:build

# API Stage
FROM node:22-alpine AS api

WORKDIR /app

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the entire built application from the builder stage
COPY --from=builder /app /app

# Set environment variables
ENV PORT=3300
ENV NODE_ENV=production

EXPOSE 3300

# Start API
CMD ["node", "apps/api/dist/main.js"]

# Web Stage
FROM nginx:alpine AS web

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
