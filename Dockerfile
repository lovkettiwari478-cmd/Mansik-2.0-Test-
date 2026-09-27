FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps --only=production=false

# Copy source
COPY . .

# Build
RUN npm run build

# Create data directory
RUN mkdir -p data/uploads && chmod 755 data/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)throw new Error('unhealthy'); console.log('healthy')}).catch(()=>process.exit(1))"

# Run
CMD ["node", "dist/server/index.js"]

# Labels
LABEL org.opencontainers.image.title="MANISK OS"
LABEL org.opencontainers.image.version="2.0.0"
LABEL org.opencontainers.image.description="Personal AI Operating System - Production Hardened"
