# Build from project root: docker build -f services/backend/Dockerfile .
FROM node:20-alpine
WORKDIR /app

# Copy shared instrumentation
COPY instrumentation/package*.json instrumentation/
RUN cd instrumentation && npm ci --omit=dev
COPY instrumentation/ instrumentation/

# Copy backend
COPY services/backend/package*.json services/backend/
RUN cd services/backend && npm ci --omit=dev
COPY services/backend/ services/backend/

WORKDIR /app/services/backend
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "index.js"]
