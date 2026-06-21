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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds

    const res = await fetch("/api/ai/money", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ description, note, type, categories }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    
    const data = await res.json();
    return {
      description_clean: data.description_clean || description,
      category: data.category || "",
      isNewCategory: !!data.isNewCategory,
      note_clean: data.note_clean || "",
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch("/api/ai/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ note }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("Orders API failed");

    const data = await res.json();
    return {
      note_clean: data.note_clean || note,
      tip: data.tip || 0,
      delivery: data.delivery || 0,
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
  if (!navigator.onLine) return null;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch("/api/ai/recap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ period, stats, platformSales }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("Recap API failed");
    const data = await res.json();
    return data.recap;
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
