FROM node:20-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run db:generate && npm run build

RUN addgroup -S nextjs -g 1001 && adduser -S nextjs -u 1001 -G nextjs && chown -R nextjs:nextjs /app/.next
USER nextjs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["sh", "-c", "node scripts/production-preflight.mjs && npm run db:migrate && node .next/standalone/server.js"]
