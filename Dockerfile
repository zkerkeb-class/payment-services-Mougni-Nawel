FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache python3 make g++

RUN npm install && npm cache clean --force

COPY src/ ./src/
COPY .env.dev ./

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

RUN chown -R nextjs:nodejs /app
USER nextjs

CMD ["npm", "start"]