// src/app.ts
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import accountDataRoutes from './routes/accountDataRoutes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', accountDataRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Không tìm thấy API' }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) return res.status(400).json({ message: 'JSON request không hợp lệ' });
  console.error('Unhandled request error:', error);
  return res.status(500).json({ message: 'Lỗi máy chủ' });
});

export default app;
