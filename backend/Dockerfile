FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=5000
ENV AI_AUTO_TRAIN_ON_BOOT=false
ENV AI_PYTHON_BIN=python3

EXPOSE 5000

CMD ["npm", "start"]
