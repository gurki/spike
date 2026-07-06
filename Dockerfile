FROM oven/bun:1-slim
WORKDIR /usr/src/spike

COPY package.json bun.lock* ./
RUN bun install --production

COPY src src
COPY index.js cli.js ./

EXPOSE 8888
CMD ["bun", "index.js"]
