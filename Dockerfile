FROM mhart/alpine-node:8
RUN apk add --no-cache bash git openssh make gcc g++ python docker

WORKDIR /app
ADD . /app
RUN npm install && npm cache clean --force

EXPOSE 8080
CMD node index.js
