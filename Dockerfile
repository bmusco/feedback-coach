FROM node:20-slim

RUN apt-get update && apt-get install -y curl ca-certificates git && rm -rf /var/lib/apt/lists/*

RUN useradd -m appuser || true

USER appuser
RUN curl -fsSL https://claude.ai/install.sh | bash
USER root

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=appuser:appuser . .

USER appuser

ENV PATH="/home/appuser/.local/bin:${PATH}"
ENV CLAUDE_CLI="/home/appuser/.local/bin/claude"
ENV PORT=3333

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3333/api/health || exit 1

COPY --chown=appuser:appuser scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
