import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth.js';
import meetingRoutes from './routes/meetings.js';
import botRoutes from './routes/bots.js';
import transcriptRoutes from './routes/transcripts.js';
import webhookRoutes from './routes/webhooks.js';
import templateRoutes from './routes/templates.js';
import shareRoutes from './routes/share.js';
import searchRoutes from './routes/search.js';
import calendarRoutes from './routes/calendar.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: true, credentials: true }));

// Raw body for Svix webhook verification (before express.json)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '2mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'purelypersonal' });
});

// Webhook routes (no auth — external services)
app.use(webhookRoutes);

// Public share route (no auth)
app.use(shareRoutes);

// Authenticated routes
app.use('/api/meetings', requireAuth, meetingRoutes);
app.use('/api/bots', requireAuth, botRoutes);
app.use('/api/templates', requireAuth, templateRoutes);
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/calendar', requireAuth, calendarRoutes);

// Transcript routes are nested under meetings but need their own router
app.use('/api/meetings', requireAuth, transcriptRoutes);

app.listen(PORT, () => {
  console.log(`PurelyPersonal backend running on port ${PORT}`);
});
