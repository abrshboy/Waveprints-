import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/ai/money", async (req, res) => {
    try {
      const authHeader = req.headers.authorization || "";
      const userKey = authHeader.replace("Bearer ", "").trim();
      const apiKey = userKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "No API key found" });
      }

      const { description, note, type, categories } = req.body;
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Rewrite the description in short, clear, grammatically correct English.
Choose the single best-fitting category from the current fixed category list provided. If nothing fits well, suggest a new category name.
Also rewrite the optional note to be shorter and clearer.

Type: ${type}
Provided Note: ${note || "None"}
Raw Description: ${description}
Available Categories: ${categories?.join(", ") || "None"}
      `.trim();

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description_clean: {
                type: Type.STRING,
                description: "Short and clear rewritten description",
              },
              category: {
                type: Type.STRING,
                description: "The best fitting category. If creating a new one, this holds the new category name.",
              },
              isNewCategory: {
                type: Type.BOOLEAN,
                description: "True if the category is not from the provided list, but a new one you suggested.",
              },
              note_clean: {
                type: Type.STRING,
                description: "Short and clear rewritten note. Returns empty string if the provided note was empty.",
              }
            },
            required: ["description_clean", "category", "isNewCategory", "note_clean"],
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response");
      
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("/api/ai/money processing error", error);
      res.status(500).json({ error: "Failed to process money entry" });
    }
  });

  app.post("/api/ai/order", async (req, res) => {
    try {
      const authHeader = req.headers.authorization || "";
      const userKey = authHeader.replace("Bearer ", "").trim();
      const apiKey = userKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "No API key found" });
      }

      const { note } = req.body;
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Rewrite the optional note to be shorter and clearer without choosing a category. 
Also extract any mention of a tip or delivery fee (e.g. '100 for delivery', 'gave 20 tip'). 

Raw Note: ${note || "None"}
      `.trim();

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              note_clean: {
                type: Type.STRING,
                description: "Short and clear rewritten note",
              },
              tip: {
                type: Type.NUMBER,
                description: "The extracted tip amount, or 0 if none was mentioned.",
              },
              delivery: {
                type: Type.NUMBER,
                description: "The extracted delivery fee amount, or 0 if none was mentioned.",
              }
            },
            required: ["note_clean", "tip", "delivery"],
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response");
      
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("/api/ai/order processing error", error);
      res.status(500).json({ error: "Failed to process order entry" });
    }
  });


  app.post("/api/ai/recap", async (req, res) => {
    try {
      const authHeader = req.headers.authorization || "";
      const userKey = authHeader.replace("Bearer ", "").trim();
      const apiKey = userKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "No API key found" });
      }

      const { period, stats, platformSales } = req.body;
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
You are a friendly, encouraging AI financial assistant for a small print-on-demand t-shirt business called Threadline.
Write a short, casual, plain-English paragraph (2-4 sentences) summarizing the financial numbers for the selected period (${period}).
Do not output markdown lists, just a nice conversational paragraph. 

Data:
Total Income: $${stats.income.toFixed(2)}
Total Expense: $${stats.expense.toFixed(2)}
Net Profit: $${stats.profit.toFixed(2)}
Best Platform: ${stats.bestPlatform}
Sales per Platform: ${JSON.stringify(platformSales)}

Examples of tone: "This week your TikTok orders did really well, pushing your net profit to $120. Keep an eye on your printing costs though!"
      `.trim();

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });

      const text = response.text;
      if (!text) throw new Error("Empty response");
      
      res.json({ recap: text.trim() });
    } catch (error) {
      console.error("/api/ai/recap processing error", error);
      res.status(500).json({ error: "Failed to generate recap" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
