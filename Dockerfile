FROM node:24.14.1-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production

EXPOSE 3002

CMD ["node", "src/server.js"]
