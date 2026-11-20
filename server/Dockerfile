# Server ResQ. Cần Node >= 22.18 (chạy thẳng file .ts, dùng node:sqlite có sẵn).
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8787
EXPOSE 8787
# Dữ liệu SQLite + khóa phiên: gắn volume vào đây để không mất khi tạo lại container
VOLUME ["/app/data"]
CMD ["npm", "start"]
