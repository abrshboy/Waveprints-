export type TransactionType = "Income" | "Expense";

export interface MoneyEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  category: string;
  description: string;
  description_clean: string;
  amount: number;
  note?: string;
  source: "manual" | "auto_order";
  linked_order_id: string | null;
  synced: boolean;
  created_at: number;
  updated_at?: number;
}

export interface OrderEntry {
  order_id: string; // ORD0001
  date: string; // YYYY-MM-DD
  product: string;
  qty: number;
  material_unit_cost: number;
  material_cost: number;
  printing_unit_cost: number;
  printing_cost: number;
  transport_cost: number;
  other_cost: number;
  total_cost: number;
  selling_price: number;
  tip: number;
  delivery_fee: number;
  net_profit: number;
  platform: string;
  note?: string;
  synced: boolean;
  created_at: number;
  updated_at?: number;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface AppSettings {
  id: "global";
  incomeCategories: string[];
  expenseCategories: string[];
  platforms: string[];
  defaultMaterialUnitCost: number;
  defaultPrintingUnitCost: number;
  geminiApiKey: string;
  minProfitMargin: number;
  firebaseConfig?: FirebaseConfig;
}

export interface DailySharedCost {
  date: string; // YYYY-MM-DD
  transport_cost: number;
  other_cost: number;
}
