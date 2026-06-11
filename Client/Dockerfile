FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL=http://localhost:3001/api
ARG VITE_SOCKET_URL=http://localhost:3001
ARG VITE_HCAPTCHA_SITE_KEY=
ARG VITE_REQUIRE_HCAPTCHA=false
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=https://app.posthog.com
ARG VITE_KOFI_URL=https://ko-fi.com/thecozycafes
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_HCAPTCHA_SITE_KEY=$VITE_HCAPTCHA_SITE_KEY
ENV VITE_REQUIRE_HCAPTCHA=$VITE_REQUIRE_HCAPTCHA
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
ENV VITE_KOFI_URL=$VITE_KOFI_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
