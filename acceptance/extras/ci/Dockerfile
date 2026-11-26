FROM node:latest
WORKDIR /app
COPY . .
ENV PAYMENT_API_KEY=__PAYMENT_API_KEY__
CMD ["node", "src/billing.js"]
