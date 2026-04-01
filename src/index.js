process.on('uncaughtException',  e => { console.error('UNCAUGHT:', e); process.exit(1); });
process.on('unhandledRejection', e => { console.error('UNHANDLED:', e); process.exit(1); });

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

console.log('▶ Cargando rutas...');
const authRoutes      = require('./routes/auth');
const casesRoutes     = require('./routes/cases');
const dashboardRoutes = require('./routes/dashboard');
console.log('▶ Rutas cargadas OK');

const app  = express();
const PORT = process.env.PORT || 3001;

console.log(`▶ PORT=${PORT} | NODE_ENV=${process.env.NODE_ENV}`);
console.log(`▶ DATABASE_URL present: ${!!process.env.DATABASE_URL}`);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use('/api/auth',      authRoutes);
app.use('/api/cases',     casesRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor escuchando en 0.0.0.0:${PORT}`);
});
