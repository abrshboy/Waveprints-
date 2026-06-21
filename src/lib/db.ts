import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { MoneyEntry, OrderEntry, AppSettings, DailySharedCost } from "../types";

interface ThreadlineDB extends DBSchema {
  money: {
    key: string;
    value: MoneyEntry;
    indexes: { "by-date": string };
  };
  orders: {
    key: string;
    value: OrderEntry;
    indexes: { "by-date": string };
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  daily_costs: {
    key: string;
    value: DailySharedCost;
  };
}

let dbPromise: Promise<IDBPDatabase<ThreadlineDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ThreadlineDB>("ThreadlineDB", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("money")) {
          const store = db.createObjectStore("money", { keyPath: "id" });
          store.createIndex("by-date", "date");
        }
        if (!db.objectStoreNames.contains("orders")) {
          const store = db.createObjectStore("orders", { keyPath: "order_id" });
          store.createIndex("by-date", "date");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("daily_costs")) {
          db.createObjectStore("daily_costs", { keyPath: "date" });
        }
      },
    });
  }
  return dbPromise;
}

export const defaultSettings: AppSettings = {
  id: "global",
  incomeCategories: ["POD Sales", "Other Income"],
  expenseCategories: ["Food", "Transport", "Shop/Rent", "Supplies & Materials", "Equipment", "Personal", "Other"],
  platforms: ["Telegram", "TikTok"],
  defaultMaterialUnitCost: 0,
  defaultPrintingUnitCost: 0,
  geminiApiKey: "",
  minProfitMargin: 35,
};

export async function initSettings() {
  const db = await getDB();
  const settings = await db.get("settings", "global");
  if (!settings) {
    await db.put("settings", defaultSettings);
  }
}

// Global Event Emitter for DB changes
type Listener = () => void;
type SyncListener = (isSyncing: boolean) => void;

class DBEventTarget {
  listeners: Set<Listener> = new Set();
  syncListeners: Set<SyncListener> = new Set();
  
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  subscribeSync(listener: SyncListener) {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }
  
  notify() {
    this.listeners.forEach((l) => l());
  }
  
  notifySyncing(isSyncing: boolean) {
    this.syncListeners.forEach((l) => l(isSyncing));
  }
}

export const dbEvents = new DBEventTarget();
