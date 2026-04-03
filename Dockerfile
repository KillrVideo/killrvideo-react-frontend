# Stage 1 — Build
FROM node:22-alpine AS build

WORKDIR /app

ARG BACKEND_URL
ENV VITE_BACKEND_URL=$BACKEND_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2 — Serve
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx template (envsubst replaces ${API_BACKEND_URL} at container start)
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/cert.pem /etc/nginx/ssl/
COPY docker/key.pem /etc/nginx/ssl/

# Copy built static files
COPY --from=build /app/dist /usr/share/nginx/html

# Only substitute our variable, not nginx's own $uri, $host, etc.
ENV NGINX_ENVSUBST_FILTER=API_

# Default backend URL (override at runtime with -e)
ENV API_BACKEND_URL=https://backend:8443

EXPOSE 80
EXPOSE 443
