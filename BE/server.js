// server.js - GramaGIS Backend Server
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// ES6 module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5500;

// Middleware
app.use(cors());
app.use(express.json());

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

// Example API route for NLP query (placeholder)
app.post('/api/nlquery', async (req, res) => {
    try {
        const { query, schema } = req.body;
        
        // TODO: Implement Gemini API integration here
        // For now, return a dummy response
        res.json({
            text: JSON.stringify({
                layer: "hospitals",
                cql: "ward_no = 3"
            })
        });
    } catch (error) {
        console.error('NLP Query Error:', error);
        res.status(500).json({ error: 'Query processing failed' });
    }
});

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
