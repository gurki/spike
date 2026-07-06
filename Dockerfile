FROM oven/bun:1-slim
WORKDIR /usr/src/spike

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --production

COPY src src
COPY index.js cli.js ./

EXPOSE 8888
CMD ["bun", "index.js"]
