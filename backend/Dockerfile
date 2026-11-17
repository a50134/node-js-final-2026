FROM node:20-alpine

WORKDIR /app

# 先複製 package 檔再安裝，讓依賴層可以被快取
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]