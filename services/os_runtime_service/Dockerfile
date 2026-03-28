FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY services/os_runtime_service/package.json ./

# Install dependencies based on package.json (no lockfile yet)
RUN npm install

# Copy Service Code
COPY services/os_runtime_service/src ./src

# Copy Orchestrator Code (Required for Dispatcher)
COPY orchestrator ./orchestrator

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
