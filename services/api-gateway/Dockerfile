# Build from project root: docker build -f services/api-gateway/Dockerfile .
FROM node:20-alpine
WORKDIR /app

# Copy shared instrumentation
COPY instrumentation/package*.json instrumentation/
RUN cd instrumentation && npm ci --omit=dev
COPY instrumentation/ instrumentation/

# Copy api-gateway
COPY services/api-gateway/package*.json services/api-gateway/
RUN cd services/api-gateway && npm ci --omit=dev
COPY services/api-gateway/ services/api-gateway/

WORKDIR /app/services/api-gateway
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
