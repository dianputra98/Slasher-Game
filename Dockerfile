# Stage 1: Build source code dengan Node.js
FROM node:18-alpine AS build-stage
WORKDIR /app

# Salin file package.json untuk install dependencies
COPY package*.json ./
RUN npm install

# Salin seluruh kode proyek (termasuk src, index.html, vite.config.ts)
COPY . .

# Jalankan perintah build Vite (akan menghasilkan folder 'dist')
RUN npm run build

# Stage 2: Serve menggunakan Nginx
FROM nginx:alpine

# Salin konfigurasi custom Nginx ke dalam kontainer
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Salin hasil build dari stage 1 ke folder HTML Nginx
COPY --from=build-stage /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
