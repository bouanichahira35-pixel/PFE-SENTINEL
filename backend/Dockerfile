FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=5000
ENV AI_AUTO_TRAIN_ON_BOOT=false

EXPOSE 5000

CMD ["npm", "start"]
