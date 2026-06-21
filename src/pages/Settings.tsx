import { useState } from "react";
import { Plus, Trash2, Download } from "lucide-react";
import { Button, Card, Input, Label } from "../components/ui";
import { useSettings, useOrders, useMoneyEntries } from "../hooks/useData";
import { getDB, dbEvents } from "../lib/db";
import { initFirebase, syncData } from "../lib/sync";

export default function SettingsPage() {
  const settings = useSettings();
  const orders = useOrders();
  const moneyEntries = useMoneyEntries();
  const [newIncomeCat, setNewIncomeCat] = useState("");
  const [newExpenseCat, setNewExpenseCat] = useState("");
  const [newPlatform, setNewPlatform] = useState("");

  const updateSettings = async (updates: Partial<typeof settings>) => {
    const db = await getDB();
    const newSettings = { ...settings, ...updates };
    await db.put("settings", newSettings);
    dbEvents.notify();
    return newSettings;
  };

  const updateFirebase = async (field: string, value: string) => {
    const config = { ...(settings.firebaseConfig || {} as any), [field]: value };
    const newSettings = await updateSettings({ firebaseConfig: config });
    if (config.projectId && config.apiKey) {
      if (initFirebase(config)) syncData();
    }
  };

  const addListItem = async (key: keyof typeof settings, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const list = settings[key] as string[];
    if (list.includes(value.trim())) return;
    await updateSettings({ [key]: [...list, value.trim()] });
    setter("");
  };

  const removeListItem = async (key: keyof typeof settings, value: string) => {
    const list = settings[key] as string[];
    await updateSettings({ [key]: list.filter((item) => item !== value) });
  };

  const exportCSV = (type: "money" | "orders") => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === "money") {
      headers = ["ID", "Date", "Type", "Category", "Description", "Income", "Expense", "Source", "Linked Order", "Note"];
      rows = moneyEntries.map(m => [
        m.id, m.date, m.type, m.category, `"${m.description}"`, 
        m.type === "Income" ? String(m.amount) : "",
        m.type === "Expense" ? String(m.amount) : "",
        m.source, m.linked_order_id || "", `"${m.note || ""}"`
      ]);
    } else {
      headers = ["Order ID", "Date", "Product", "Qty", "Material Cost", "Printing Cost", "Transport Cost", "Other Cost", "Total Cost", "Selling Price", "Tip", "Delivery Fee", "Net Profit", "Platform", "Note"];
      rows = orders.map(o => [
        o.order_id, o.date, `"${o.product}"`, String(o.qty), 
        String(o.material_cost), String(o.printing_cost), String(o.transport_cost), String(o.other_cost), String(o.total_cost),
        String(o.selling_price), String(o.tip), String(o.delivery_fee), String(o.net_profit), o.platform, `"${o.note || ""}"`
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `threadline_${type}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Settings</h2>
        <p className="text-sm text-zinc-400 mt-1">Configure your categories and preferences.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Categories */}
        <Card className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-zinc-200 mb-4">Income Categories</h3>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="New category..."
                value={newIncomeCat}
                onChange={(e) => setNewIncomeCat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addListItem("incomeCategories", newIncomeCat, setNewIncomeCat)}
              />
              <Button onClick={() => addListItem("incomeCategories", newIncomeCat, setNewIncomeCat)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <ul className="space-y-2">
              {settings.incomeCategories.map((cat) => (
                <li key={cat} className="flex items-center justify-between p-2 rounded-md bg-zinc-800/30 text-sm text-zinc-300">
                  {cat}
                  <button onClick={() => removeListItem("incomeCategories", cat)} className="text-zinc-500 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-zinc-800/50">
            <h3 className="text-sm font-medium text-zinc-200 mb-4">Expense Categories</h3>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="New category..."
                value={newExpenseCat}
                onChange={(e) => setNewExpenseCat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addListItem("expenseCategories", newExpenseCat, setNewExpenseCat)}
              />
              <Button onClick={() => addListItem("expenseCategories", newExpenseCat, setNewExpenseCat)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <ul className="space-y-2">
              {settings.expenseCategories.map((cat) => (
                <li key={cat} className="flex items-center justify-between p-2 rounded-md bg-zinc-800/30 text-sm text-zinc-300">
                  {cat}
                  <button onClick={() => removeListItem("expenseCategories", cat)} className="text-zinc-500 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-medium text-zinc-200 mb-4">Sales Platforms</h3>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="New platform..."
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addListItem("platforms", newPlatform, setNewPlatform)}
              />
              <Button onClick={() => addListItem("platforms", newPlatform, setNewPlatform)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <ul className="space-y-2">
              {settings.platforms.map((plat) => (
                <li key={plat} className="flex items-center justify-between p-2 rounded-md bg-zinc-800/30 text-sm text-zinc-300">
                  {plat}
                  <button onClick={() => removeListItem("platforms", plat)} className="text-zinc-500 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-200">AI Settings</h3>
            <div className="space-y-1.5">
              <Label>Gemini API Key (Optional)</Label>
              <Input
                type="password"
                placeholder="Paste your Gemini API key..."
                value={settings.geminiApiKey || ""}
                onChange={(e) => updateSettings({ geminiApiKey: e.target.value })}
              />
              <p className="text-[10px] text-zinc-500">
                Required for AI features when deployed on static platforms like Netlify. Stored securely in your browser's IndexedDB. Get your free key from Google AI Studio.
              </p>
            </div>
            <div className="pt-4 border-t border-zinc-800/50">
               <h3 className="text-sm font-medium text-zinc-200 mb-2">Alerts</h3>
               <div className="space-y-1.5 pt-2">
                 <Label>Minimum Profit Margin (%)</Label>
                 <Input
                   type="number"
                   min="0"
                   max="100"
                   value={settings.minProfitMargin || 35}
                   onChange={(e) => updateSettings({ minProfitMargin: parseFloat(e.target.value) || 0 })}
                 />
                 <p className="text-[10px] text-zinc-500">
                   Get alerted on the dashboard if an order falls below this net profit margin.
                 </p>
               </div>
            </div>
            
            <div className="pt-4 border-t border-zinc-800/50">
               <h3 className="text-sm font-medium text-zinc-200 mb-2">Sync Settings (Firebase)</h3>
               <p className="text-xs text-zinc-500 mb-4">Connect a Firebase project to sync your data across devices.</p>
               <div className="space-y-3">
                 <div className="space-y-1.5">
                   <Label>Project ID</Label>
                   <Input placeholder="my-firebase-project" value={settings.firebaseConfig?.projectId || ""} onChange={(e) => updateFirebase("projectId", e.target.value)} />
                 </div>
                 <div className="space-y-1.5">
                   <Label>API Key</Label>
                   <Input type="password" placeholder="AIzaSy..." value={settings.firebaseConfig?.apiKey || ""} onChange={(e) => updateFirebase("apiKey", e.target.value)} />
                 </div>
                 <div className="space-y-1.5">
                   <Label>Auth Domain</Label>
                   <Input placeholder="project.firebaseapp.com" value={settings.firebaseConfig?.authDomain || ""} onChange={(e) => updateFirebase("authDomain", e.target.value)} />
                 </div>
                 <div className="space-y-1.5">
                   <Label>App ID</Label>
                   <Input placeholder="1:1234:web:xyz..." value={settings.firebaseConfig?.appId || ""} onChange={(e) => updateFirebase("appId", e.target.value)} />
                 </div>
               </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-200">Data Export</h3>
            <p className="text-xs text-zinc-500 mb-2">Export your tracked data in CSV format for use in Excel or Google Sheets.</p>
            <div className="space-y-3">
              <Button onClick={() => exportCSV("money")} variant="secondary" className="w-full justify-start">
                <Download className="w-4 h-4 mr-2" />
                Export Money Tracker (CSV)
              </Button>
              <Button onClick={() => exportCSV("orders")} variant="secondary" className="w-full justify-start">
                <Download className="w-4 h-4 mr-2" />
                Export Orders Tracker (CSV)
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
