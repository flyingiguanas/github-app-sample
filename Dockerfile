FROM node:20.9-alpine3.18 AS base
ENV DIRPATH=/home/node/app
WORKDIR $DIRPATH
ARG NPM_TOKEN

RUN apk add git

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build
RUN chown -R node /home/node
# RUN npm prune --omit=dev

USER node
EXPOSE 3000
CMD ["npm", "start"]
