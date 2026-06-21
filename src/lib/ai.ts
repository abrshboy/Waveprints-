import { AppSettings } from "../types";

export interface MoneyAIResult {
  description_clean: string;
  category: string;
  isNewCategory: boolean;
  note_clean: string;
  isOffline: boolean;
}

export interface OrderAIResult {
  note_clean: string;
  tip: number;
  delivery: number;
  isOffline: boolean;
}

export async function processMoneyEntry(
  description: string,
  note: string,
  type: string,
  categories: string[],
  apiKey: string
): Promise<MoneyAIResult> {
  if (!navigator.onLine) {
    return runLocalMoneyFallback(description, note, type, categories);
  }

  if (!apiKey) {
    console.warn("No API key provided, falling back to local processing");
    return runLocalMoneyFallback(description, note, type, categories);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds

    const prompt = `
Rewrite the description in short, clear, grammatically correct English.
Choose the single best-fitting category from the current fixed category list provided. If nothing fits well, suggest a new category name.
Also rewrite the optional note to be shorter and clearer.

Type: ${type}
Provided Note: ${note || "None"}
Raw Description: ${description}
Available Categories: ${categories?.join(", ") || "None"}
    `.trim();

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            description_clean: { type: "STRING" },
            category: { type: "STRING" },
            isNewCategory: { type: "BOOLEAN" },
            note_clean: { type: "STRING" }
          },
          required: ["description_clean", "category", "isNewCategory", "note_clean"]
        }
      }
    };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    
    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("Empty response from AI");
    
    const parsed = JSON.parse(resultText);

    return {
      description_clean: parsed.description_clean || description,
      category: parsed.category || "",
      isNewCategory: !!parsed.isNewCategory,
      note_clean: parsed.note_clean || "",
      isOffline: false
    };

  } catch (error) {
    console.error("AI API failed, falling back to local processing", error);
    return runLocalMoneyFallback(description, note, type, categories);
  }
}

export async function processOrderEntry(
  note: string,
  apiKey: string
): Promise<OrderAIResult> {
  if (!navigator.onLine) {
    return runLocalOrderFallback(note);
  }
  
  if (!note || note.trim() === "") {
    return { note_clean: "", tip: 0, delivery: 0, isOffline: false };
  }

  if (!apiKey) {
    return runLocalOrderFallback(note);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const prompt = `
Rewrite the optional note to be shorter and clearer without choosing a category. 
Also extract any mention of a tip or delivery fee (e.g. '100 for delivery', 'gave 20 tip'). 

Raw Note: ${note || "None"}
    `.trim();

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            note_clean: { type: "STRING" },
            tip: { type: "NUMBER" },
            delivery: { type: "NUMBER" }
          },
          required: ["note_clean", "tip", "delivery"]
        }
      }
    };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("Orders API failed");

    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("Empty response from AI");
    
    const parsed = JSON.parse(resultText);

    return {
      note_clean: parsed.note_clean || note,
      tip: parsed.tip || 0,
      delivery: parsed.delivery || 0,
      isOffline: false
    };
  } catch (error) {
    console.warn("AI Order API offline/failed:", error);
    return runLocalOrderFallback(note);
  }
}

export async function generateAIRecap(
  period: string,
  stats: any,
  platformSales: any,
  apiKey: string
): Promise<string | null> {
  if (!navigator.onLine || !apiKey) return null;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

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

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("Recap API failed");
    
    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return resultText ? resultText.trim() : null;
  } catch (error) {
    console.warn("AI Recap offline/failed:", error);
    return null;
  }
}

// Fallbacks
function basicCleanup(text: string) {
  if (!text) return "";
  let clean = text.trim();
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  clean = clean.replace(/\s+/g, ' '); 
  return clean;
}

function runLocalMoneyFallback(description: string, note: string, type: string, categories: string[]): MoneyAIResult {
  const desc = description.toLowerCase();
  let matchedCat = "";
  
  if (type === "Expense") {
    if (desc.includes("lunch") || desc.includes("dinner") || desc.includes("food") || desc.includes("breakfast") || desc.includes("coffee")) {
      matchedCat = categories.find(c => c.toLowerCase().includes("food")) || "";
    } else if (desc.includes("taxi") || desc.includes("ride") || desc.includes("bus") || desc.includes("transport")) {
      matchedCat = categories.find(c => c.toLowerCase().includes("transport")) || "";
    } else if (desc.includes("ink") || desc.includes("shirt") || desc.includes("thread")) {
      matchedCat = categories.find(c => c.toLowerCase().includes("supplies")) || "";
    } else {
      matchedCat = categories.find(c => c.toLowerCase().includes("other")) || (categories[0] ?? "");
    }
  } else {
    matchedCat = categories.find(c => c.toLowerCase().includes("other")) || (categories[0] ?? "");
  }

  return {
    description_clean: basicCleanup(description),
    category: matchedCat || "Other",
    isNewCategory: false,
    note_clean: basicCleanup(note),
    isOffline: true
  };
}

function runLocalOrderFallback(note: string): OrderAIResult {
  return {
    note_clean: basicCleanup(note),
    tip: 0,
    delivery: 0,
    isOffline: true
  };
}
