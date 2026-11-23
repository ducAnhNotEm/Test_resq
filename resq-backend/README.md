# ResQ backend

Node.js, Express 5, TypeScript, PostgreSQL and the Prisma 8 RC PostgreSQL ORM already used by this project.

## Local setup

1. Copy `.env.example` to `.env`, set `DATABASE_URL`, and set a random `JWT_SECRET` of at least 32 characters.
2. Start the PostgreSQL database.
3. Run `npm install`, `npm run typecheck`, then `npx prisma db migrate` from this directory.
4. Start the API with `npm run dev`.
5. Import `postman/ResQ.postman_collection.json` and `postman/ResQ.postman_environment.json` into Postman. Run the requests in order.

In local development (`NODE_ENV` is not `production`), `POST /api/auth/request-otp` includes `devOtp` in its response so the Postman flow can continue without an SMS vendor. Production deliberately returns 503 for OTP until an SMS provider has been configured; it never exposes the OTP in production.

For a physical device, set `EXPO_PUBLIC_API_URL` in the mobile app to the computer's LAN address, for example `http://192.168.1.20:3000/api`. Android emulator can use `http://10.0.2.2:3000/api`.

## API routes

All successful resource responses use `{ "data": ... }`; delete returns `204 No Content`. All routes below require `Authorization: Bearer <accessToken>` unless marked public.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Liveness check |
| POST | `/api/auth/request-otp` | Public | Create a five minute OTP; one request per minute |
| POST | `/api/auth/verify-otp` | Public | Verify OTP and issue a 7 day access token |
| POST | `/api/auth/social-login` | Public | Verify Google/Facebook provider token server-side |
| POST | `/api/auth/logout` | Protected | Revoke all sessions for this account |
| GET / PATCH | `/api/users/me` | Protected | Read/update name, email and avatar URL |
| PUT | `/api/users/me/push-token` | Protected | Set a push token or send `null` to remove it |
| GET / POST | `/api/vehicles` | Protected | List/create a vehicle (maximum 10) |
| PATCH / DELETE | `/api/vehicles/:id` | Protected | Update/delete a vehicle |
| GET / POST | `/api/emergency-contacts` | Protected | List/create contacts (maximum 5) |
| PATCH / DELETE | `/api/emergency-contacts/:id` | Protected | Update/delete a contact |
| GET / POST | `/api/saved-places` | Protected | List/create places (maximum 50) |
| PATCH / DELETE | `/api/saved-places/:id` | Protected | Update/delete a place |

User-owned records are always scoped to the authenticated account. `phoneNumber` is intentionally immutable through profile PATCH; changing it must use a separate OTP verification flow.
