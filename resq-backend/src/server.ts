// src/server.ts
import app from './app';

const PORT = process.env.PORT || 3000;

// Không cần gọi connect thủ công nữa
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});