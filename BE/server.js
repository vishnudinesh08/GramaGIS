// server.js - GramaGIS Backend Server
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/auth.js';
import feedbackRouter from './routes/feedback.js';
import queryRouter from './routes/query.js';
import proxyRouter from './routes/proxy.js';

// ES6 module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const requiredEnv = ['JWT_SECRET'];
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
if (missingEnv.length) {
    console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text({ type: ['text/xml', 'application/xml', 'application/gml+xml'] }));

// Serve static files from FE directory
app.use('/FE', express.static(path.join(__dirname, '../FE')));

// Root route
app.get('/', (req, res) => {
    res.redirect('/FE/html/index.html');
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'GramaGIS Backend is running' });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/nlquery', queryRouter);
app.use('/api/proxy', proxyRouter);

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║        GramaGIS Backend Server                ║
║  Server running at http://localhost:${PORT}    ║
║                                               ║
║  Frontend: http://localhost:${PORT}/FE/html/  ║
║  Map Page: http://localhost:${PORT}/FE/html/map.html ║
╚═══════════════════════════════════════════════╝
    `);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});


