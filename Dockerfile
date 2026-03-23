# NAT Type Detector - Dockerfile

FROM node:20-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY server/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY server/ ./

# Build TypeScript
RUN npm run build

# Expose ports
EXPOSE 3000 8080 3478/udp 3479/udp

# Run the application
CMD ["node", "dist/index.js"]
