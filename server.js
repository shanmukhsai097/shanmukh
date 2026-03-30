require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-me';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'verdana2024';
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SLOT_TIMES = [
  '12:00 PM',
  '12:30 PM',
  '01:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '07:00 PM',
  '07:30 PM',
  '08:00 PM',
  '08:30 PM',
  '09:00 PM',
  '09:30 PM'
];
const STATUS_VALUES = ['pending', 'confirmed', 'filled'];

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      sequence: 1000,
      bookings: [
        {
          id: crypto.randomUUID(),
          reference: 'VRD-1001',
          date: getTomorrowDate(1),
          time: '07:30 PM',
          guests: '2 Guests',
          fname: 'Aarav',
          lname: 'Mehta',
          email: 'aarav@example.com',
          phone: '+91 98765 11111',
          notes: 'Window seat preferred',
          status: 'pending',
          created: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notificationStatus: 'not-sent'
        },
        {
          id: crypto.randomUUID(),
          reference: 'VRD-1002',
          date: getTomorrowDate(2),
          time: '08:30 PM',
          guests: '4 Guests',
          fname: 'Nisha',
          lname: 'Kapoor',
          email: 'nisha@example.com',
          phone: '+91 98765 22222',
          notes: 'Birthday dinner',
          status: 'confirmed',
          created: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notificationStatus: 'sent-demo'
        }
      ]
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }
}

function getTomorrowDate(offset = 1) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function readDb() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function nextReference(db) {
  db.sequence += 1;
  return `VRD-${db.sequence}`;
}

function normalizeDate(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? value : null;
}

function isPastDate(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString + 'T00:00:00');
  return target < today;
}

function isClosedSlot(booking) {
  return booking.status === 'confirmed' || booking.status === 'filled';
}

function getAvailability(db, date) {
  return SLOT_TIMES.map((time) => {
    const slotTaken = db.bookings.some(
      (booking) => booking.date === date && booking.time === time && isClosedSlot(booking)
    );

    return {
      time,
      status: slotTaken ? 'filled' : 'available'
    };
  });
}

function sanitizeBooking(booking) {
  return {
    id: booking.id,
    reference: booking.reference,
    date: booking.date,
    time: booking.time,
    guests: booking.guests,
    fname: booking.fname,
    lname: booking.lname,
    email: booking.email,
    phone: booking.phone,
    notes: booking.notes,
    status: booking.status,
    created: booking.created,
    updatedAt: booking.updatedAt,
    notificationStatus: booking.notificationStatus || 'not-sent'
  };
}

function sanitizePublicBooking(booking) {
  return {
    reference: booking.reference,
    guestName: `${booking.fname} ${booking.lname}`.trim(),
    date: booking.date,
    time: booking.time,
    guests: booking.guests,
    status: booking.status
  };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing admin token.' });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired admin token.' });
  }
}

function buildCorsOptions() {
  const rawOrigins = process.env.ALLOWED_ORIGINS || '';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!allowedOrigins.length) {
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin not allowed.'));
    }
  };
}

function buildTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

async function sendStatusEmail(booking) {
  const transporter = buildTransporter();
  if (!transporter) {
    return { delivered: false, reason: 'SMTP not configured' };
  }

  const subject =
    booking.status === 'confirmed'
      ? `Reservation confirmed • ${booking.reference}`
      : `Reservation slot closed • ${booking.reference}`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2c2c2a">
      <h2 style="margin-bottom:8px">Verdana Reservations</h2>
      <p>Hello ${booking.fname},</p>
      <p>
        Your reservation status is now <strong>${booking.status.toUpperCase()}</strong>.
      </p>
      <p>
        <strong>Reference:</strong> ${booking.reference}<br>
        <strong>Date:</strong> ${booking.date}<br>
        <strong>Time:</strong> ${booking.time}<br>
        <strong>Guests:</strong> ${booking.guests}
      </p>
      <p>For help, reply to this email or call the restaurant directly.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: booking.email,
    subject,
    html
  });

  return { delivered: true };
}

app.use(cors(buildCorsOptions()));
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'verdana-restaurant-api',
    time: new Date().toISOString()
  });
});

app.get('/api/slots', (req, res) => {
  const date = normalizeDate(req.query.date) || getTomorrowDate(1);
  const db = readDb();
  res.json({ date, slots: getAvailability(db, date) });
});

app.post('/api/bookings', (req, res) => {
  const { date, time, guests, fname, lname, email, phone, notes } = req.body || {};
  const safeDate = normalizeDate(date);

  if (!safeDate) {
    return res.status(400).json({ message: 'A valid booking date is required.' });
  }

  if (isPastDate(safeDate)) {
    return res.status(400).json({ message: 'Booking date cannot be in the past.' });
  }

  if (!SLOT_TIMES.includes(time)) {
    return res.status(400).json({ message: 'Selected slot is invalid.' });
  }

  if (!fname || !lname || !email || !phone) {
    return res.status(400).json({ message: 'Full name, email, and phone are required.' });
  }

  const db = readDb();
  const conflict = db.bookings.find(
    (booking) => booking.date === safeDate && booking.time === time && isClosedSlot(booking)
  );

  if (conflict) {
    return res.status(409).json({ message: 'That slot is already filled. Please choose another time.' });
  }

  const booking = {
    id: crypto.randomUUID(),
    reference: nextReference(db),
    date: safeDate,
    time,
    guests: guests || '2 Guests',
    fname: String(fname).trim(),
    lname: String(lname).trim(),
    email: String(email).trim(),
    phone: String(phone).trim(),
    notes: notes ? String(notes).trim() : '',
    status: 'pending',
    created: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notificationStatus: 'not-sent'
  };

  db.bookings.unshift(booking);
  writeDb(db);

  res.status(201).json({
    message: 'Reservation request submitted successfully.',
    booking: sanitizePublicBooking(booking)
  });
});

app.get('/api/bookings/lookup', (req, res) => {
  const reference = String(req.query.reference || '').trim().toUpperCase();
  const phone = String(req.query.phone || '').trim();

  if (!reference && !phone) {
    return res.status(400).json({ message: 'Provide a reservation reference or phone number.' });
  }

  const db = readDb();
  const booking = db.bookings.find((item) => {
    const referenceMatch = reference ? item.reference.toUpperCase() === reference : true;
    const phoneMatch = phone ? item.phone === phone : true;
    return referenceMatch && phoneMatch;
  });

  if (!booking) {
    return res.status(404).json({ message: 'No booking matched that reference / phone combination.' });
  }

  res.json({ booking: sanitizePublicBooking(booking) });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Invalid admin credentials.' });
  }

  const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const db = readDb();
  const stats = db.bookings.reduce(
    (acc, booking) => {
      acc.total += 1;
      if (booking.status === 'pending') acc.pending += 1;
      if (booking.status === 'confirmed') acc.confirmed += 1;
      if (booking.status === 'filled') acc.filled += 1;
      return acc;
    },
    { total: 0, pending: 0, confirmed: 0, filled: 0 }
  );

  res.json(stats);
});

app.get('/api/admin/bookings', authMiddleware, (req, res) => {
  const status = String(req.query.status || 'all');
  const db = readDb();
  const filtered =
    status === 'all' ? db.bookings : db.bookings.filter((booking) => booking.status === status);

  res.json({ bookings: filtered.map(sanitizeBooking) });
});

app.patch('/api/admin/bookings/:id/status', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!STATUS_VALUES.includes(status)) {
    return res.status(400).json({ message: 'Unsupported reservation status.' });
  }

  const db = readDb();
  const booking = db.bookings.find((item) => item.id === id);

  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  if ((status === 'confirmed' || status === 'filled') && booking.status !== status) {
    const conflict = db.bookings.find(
      (item) =>
        item.id !== booking.id &&
        item.date === booking.date &&
        item.time === booking.time &&
        isClosedSlot(item)
    );

    if (conflict) {
      return res.status(409).json({ message: 'That slot is already occupied by another confirmed booking.' });
    }
  }

  booking.status = status;
  booking.updatedAt = new Date().toISOString();

  try {
    const emailResult = await sendStatusEmail(booking);
    booking.notificationStatus = emailResult.delivered ? 'sent' : `skipped: ${emailResult.reason}`;
  } catch (error) {
    booking.notificationStatus = `failed: ${error.message}`;
  }

  writeDb(db);

  res.json({
    message: 'Booking status updated successfully.',
    booking: sanitizeBooking(booking)
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Verdana backend running on http://localhost:${PORT}`);
});
