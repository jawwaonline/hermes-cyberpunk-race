# Built: 2026-06-30
ARG BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
FROM node:22-alpine
LABEL org.opencontainers.image.created=$BUILD_DATE
WORKDIR /app
# Copy everything first so preinstall (generate-version.js) can find scripts/
COPY . .
RUN npm ci --omit=dev && npm cache clean --force
EXPOSE 3000
CMD ["node", "src/server.js"]
