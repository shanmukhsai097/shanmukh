# Verdana Restaurant Backend Demo

This package turns the uploaded HTML restaurant site into a working demo with a real backend.

## What it adds

- Persistent reservation storage in `data.json`
- Public API for slot availability and reservation creation
- Reservation status lookup by reference and phone number
- Admin login with JWT token authentication
- Admin APIs to list bookings, confirm reservations, and mark slots as filled
- Optional email sending when a reservation is confirmed or filled
- Frontend served from the same Node app at `/`

## Project structure

- `server.js` — Express backend and API routes
- `public/index.html` — your frontend, updated to call the backend APIs
- `.env.example` — environment variables template
- `data.json` — created automatically on first run

## Run locally

```bash
cd verdana_backend_demo
cp .env.example .env
npm install
npm start
```

Open:

```bash
http://localhost:4000
```

## Demo admin login

Default demo credentials come from `.env`:

- Username: `admin`
- Password: `verdana2024`

## Main API endpoints

- `GET /api/health`
- `GET /api/slots?date=YYYY-MM-DD`
- `POST /api/bookings`
- `GET /api/bookings/lookup?reference=VRD-1001&phone=+91...`
- `POST /api/admin/login`
- `GET /api/admin/stats`
- `GET /api/admin/bookings?status=all`
- `PATCH /api/admin/bookings/:id/status`

## Booking flow

1. Customer selects a date and slot.
2. Backend checks whether the slot is already confirmed or filled.
3. Reservation is stored as `pending`.
4. Admin logs in and changes status to `confirmed` or `filled`.
5. Once confirmed or filled, that slot becomes unavailable for new bookings.
6. Customer can track status using reservation reference and phone number.
7. If SMTP is configured, the backend also sends an email.

## Optional email setup

Fill these in `.env` if you want real confirmation emails:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `FROM_EMAIL`

If SMTP is not configured, the system still works and stores the notification result in admin view.

## Production notes

For a real production deployment, replace the demo admin username/password with a proper users table and hashed passwords, add rate limiting, server-side validation hardening, HTTPS, and a real database such as PostgreSQL.
