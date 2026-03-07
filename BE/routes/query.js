// routes/query.js — POST /api/nlquery
// Receives the user's natural-language query from the map page,
// forwards it to Gemini, and returns the raw text response.
// The Gemini API key stays on the server — never sent to the browser.

import { Router } from "express";
import fetch from "node-fetch";

const router = Router();

router.post("/", async (req, res) => {
    const { query, schema } = req.body;

    if (!query) {
        return res.status(400).json({ error: "query field is required." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
        console.error("GEMINI_API_KEY not configured in .env");
        return res.status(503).json({ error: "AI service is not configured." });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = (schema || "") + `\n\nUser query: "${query}"\n\nRespond with JSON only.`;

    try {
        const geminiRes = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 256 }
            })
        });

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error("Gemini error:", geminiRes.status, errText.slice(0, 300));
            return res.status(502).json({ error: "AI service returned an error." });
        }

        const data = await geminiRes.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        res.json({ text });

    } catch (err) {
        console.error("Gemini fetch error:", err.message);
        res.status(502).json({ error: "Could not reach AI service." });
    }
});

export default router;
