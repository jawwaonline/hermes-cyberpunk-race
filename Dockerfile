# Built: 2026-06-30
ARG BUILD_DATE=unknown
ARG GIT_COMMIT_SHA=unknown
FROM node:22-alpine
LABEL org.opencontainers.image.created=$BUILD_DATE
WORKDIR /app
# Copy everything first so preinstall (generate-version.js) can find scripts/
COPY . .
RUN GIT_COMMIT_SHA=${GIT_COMMIT_SHA} npm ci --omit=dev && npm cache clean --force
EXPOSE 3000
CMD ["node", "src/server.js"]
