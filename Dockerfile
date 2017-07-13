FROM mhart/alpine-node:8
RUN apk add --no-cache bash git openssh make gcc g++ python docker

WORKDIR /app
ADD package.json /app/package.json
RUN npm install
ADD . /app

EXPOSE 8080
CMD node index.js
