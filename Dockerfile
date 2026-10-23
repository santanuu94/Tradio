FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY web/package.json ./web/

RUN npm --prefix web install --legacy-peer-deps

COPY . .

RUN npm --prefix web run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "start.mjs"]
