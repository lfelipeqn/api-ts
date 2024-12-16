# Dockerfile
FROM node::20

RUN apt update && apt install -y nano
# Install PM2 globally
RUN npm install pm2 -g

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Copy app source
COPY . .
COPY .env.production .env

# Build TypeScript
RUN npm run build:prod

# Create required directories
RUN mkdir -p dist/logs dist/uploads && \
    chown -R node:node .

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Start PM2 with production configuration
CMD ["pm2-runtime", "ecosystem.config.js"]