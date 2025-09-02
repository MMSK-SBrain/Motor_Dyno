FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Clean install with specific flags
RUN npm cache clean --force && \
    npm install --no-optional --legacy-peer-deps

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV GENERATE_SOURCEMAP=false

# Default command for development
CMD ["npm", "start"]