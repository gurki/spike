# Source: https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/
# And https://dev.to/otomato_io/how-to-optimize-production-docker-images-running-nodejs-with-yarn-504b
FROM node:slim as builder
WORKDIR /usr/src/backend
COPY . /usr/src/backend
RUN yarn install --pure-lockfile --production

FROM node:slim
WORKDIR /usr/src/backend
COPY --from=builder /usr/src/backend/node_modules node_modules
COPY --from=builder /usr/src/backend/src src
COPY --from=builder /usr/src/backend/index.js .
COPY --from=builder /usr/src/backend/package.json .
CMD ["yarn", "start"]
