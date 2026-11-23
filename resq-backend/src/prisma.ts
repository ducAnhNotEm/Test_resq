// src/prisma.ts
import postgres from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import type { Contract } from '../prisma/contract.d';
import contractJson from '../prisma/contract.json';
import 'dotenv/config'; // Đảm bảo biến môi trường được nạp

// 1. Chuyển đổi JSON thô thành contract có kiểu dữ liệu
const contract = contractFromJson<Contract>(contractJson);

// 2. Khởi tạo client với contract và URL kết nối
export const db = postgres({
  contract,
  url: process.env.DATABASE_URL!,
});