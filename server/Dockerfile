# Build from the repo root (the lockfile lives there): docker build -f server/Dockerfile .
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# Workspace manifests + lockfile first, so dependency layers cache between code changes.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force
COPY server/src server/src
COPY server/seed-docs server/seed-docs
WORKDIR /app/server
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
