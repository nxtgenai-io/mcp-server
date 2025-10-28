FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js ./
# Port is configured via env, default 8080
EXPOSE 8080
CMD ["node","server.js"]
