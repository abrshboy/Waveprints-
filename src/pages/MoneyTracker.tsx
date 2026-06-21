import React, { useState, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { Plus, Trash2, Wand2, Zap } from "lucide-react";
import { Button, Card, Input, Label, Select } from "../components/ui";
import { useSettings, useMoneyEntries, useOrders } from "../hooks/useData";
import { addMoneyEntry, deleteMoneyEntry, updateMoneyEntry } from "../lib/api";
import { TransactionType } from "../types";
import { processMoneyEntry } from "../lib/ai";
import { getDB, dbEvents } from "../lib/db";

export default function MoneyTracker() {
  const settings = useSettings();
  const allEntries = useMoneyEntries();
  const orders = useOrders();
  
  // Filter out any ghost/auto entries from before the split
  const entries = useMemo(() => allEntries.filter(e => e.source !== "auto_order"), [allEntries]);
  
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [type, setType] = useState<TransactionType>("Income");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  
  const [category, setCategory] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [suggestedCat, setSuggestedCat] = useState("");

  const activeCategories = type === "Income" ? settings.incomeCategories : settings.expenseCategories;

  useEffect(() => {
    if (!category || !activeCategories.includes(category)) {
      setCategory(activeCategories[0] || "Other");
    }
  }, [type, settings.incomeCategories, settings.expenseCategories]);

  // Compute daily net profits from orders
  const dailyProfits = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      const prev = map.get(o.date) || 0;
      map.set(o.date, prev + o.net_profit);
    });
    // sort descending by date
    return Array.from(map.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .filter(([_, profit]) => profit > 0);
  }, [orders]);

  const handleFastEntry = (d: string, profit: number) => {
    setDate(d);
    setType("Income");
    setAmount(profit.toFixed(2));
    setDescription(`Net Profit - ${d}`);
    setCategory("Sales");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleProcess = async () => {
    if (!description && !note) return;
    setIsProcessing(true);
    setIsOfflineMode(false);
    setSuggestedCat("");

    const result = await processMoneyEntry(description, note, type, activeCategories, settings.geminiApiKey);
    
    if (result.description_clean) setDescription(result.description_clean);
    if (result.note_clean) setNote(result.note_clean);
    setIsOfflineMode(result.isOffline);
    
    if (result.isNewCategory) {
      setSuggestedCat(result.category);
    } else {
      setCategory(result.category);
    }
    
    setIsProcessing(false);
  };

  const handleApproveSuggestedCat = async () => {
    const key = type === "Income" ? "incomeCategories" : "expenseCategories";
    const db = await getDB();
    const newSettings = { ...settings, [key]: [...settings[key], suggestedCat] };
    await db.put("settings", newSettings);
    dbEvents.notify();
    setCategory(suggestedCat);
    setSuggestedCat("");
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleEdit = (entry: any) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setType(entry.type);
    setDescription(entry.description);
    setAmount(String(entry.amount));
    setNote(entry.note || "");
    setCategory(entry.category);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || parseFloat(amount) <= 0) return;
    
    if (editingId) {
      const existing = entries.find(e => e.id === editingId);
      if (existing) {
        await updateMoneyEntry({
          ...existing,
          date, type, category: category || (activeCategories[0] ?? "Other"),
          description, description_clean: description,
          amount: parseFloat(amount), note,
          updated_at: Date.now()
        });
      }
      setEditingId(null);
    } else {
      await addMoneyEntry({
        id: uuidv4(),
        date,
        type,
        category: category || (activeCategories[0] ?? "Other"),
        description,
        description_clean: description, 
        amount: parseFloat(amount),
        note,
        source: "manual",
        linked_order_id: null,
        synced: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    setDescription("");
    setAmount("");
    setNote("");
    setSuggestedCat("");
    setIsOfflineMode(false);
  };

  const totalIncome = entries.filter(e => e.type === "Income").reduce((sum, e) => sum + e.amount, 0);
  const totalExpense = entries.filter(e => e.type === "Expense").reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Money Tracker</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage single income and expense records.</p>
        </div>
        <div className="flex gap-4 text-sm font-medium">
          <div className="text-zinc-400">In: <span className="text-emerald-400">${totalIncome.toFixed(2)}</span></div>
          <div className="text-zinc-400">Out: <span className="text-red-400">${totalExpense.toFixed(2)}</span></div>
        </div>
      </header>

      {/* Fast Entry: Daily Order Profits */}
      {dailyProfits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Fast Entry: Order Profits
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dailyProfits.map(([d, profit]) => {
              // Optionally skip if there's already an entry for this exact amount and date
              const isRecorded = entries.some(e => e.date === d && e.amount === profit && e.type === "Income");
              if (isRecorded) return null;

              return (
                <div key={d} className="flex justify-between items-center p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-200">{d}</span>
                    <span className="text-xs text-amber-500/80">Net Profit</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-emerald-400 font-medium">+${profit.toFixed(2)}</span>
                    <Button size="sm" variant="secondary" className="h-7 text-xs px-2" onClick={() => handleFastEntry(d, profit)}>
                      Auto-Fill
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex p-1 bg-zinc-900/80 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setType("Expense")}
                  className={`flex-1 rounded-md text-sm font-medium py-1.5 transition-colors ${type === "Expense" ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setType("Income")}
                  className={`flex-1 rounded-md text-sm font-medium py-1.5 transition-colors ${type === "Income" ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  Income
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <div className="flex gap-2">
                <Input placeholder="e.g., Bought ink cartridges" value={description} onChange={(e) => setDescription(e.target.value)} required />
                <Button variant="secondary" type="button" onClick={handleProcess} disabled={isProcessing || (!description && !note)} className="shrink-0">
                  {isProcessing ? "..." : <><Wand2 className="w-3.5 h-3.5 mr-1" /> Process</>}
                </Button>
              </div>
              {isOfflineMode && <div className="text-[10px] text-amber-500/60 pl-1">Offline mode — basic cleanup applied</div>}
            </div>
            
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {activeCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Note (Optional)</Label>
              <Input placeholder="Additional details..." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {suggestedCat && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
              <div className="text-amber-500">
                AI suggests adding new category: <strong>{suggestedCat}</strong>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" type="button" onClick={() => {
                  setSuggestedCat("");
                  setCategory(activeCategories[0] || "Other");
                }}>Reject</Button>
                <Button size="sm" type="button" onClick={handleApproveSuggestedCat}>Approve</Button>
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <Button type="submit" className="w-full md:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              {editingId ? "Update Record" : "Add Record"}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={() => {
                setEditingId(null);
                setDescription(""); setAmount(""); setNote("");
              }}>Cancel</Button>
            )}
          </div>
        </form>
      </Card>

      <div className="space-y-3 pb-8">
        <h3 className="text-sm font-medium text-zinc-400 mt-8 mb-4">Recent Records</h3>
        {entries.length === 0 ? (
          <div className="text-center p-8 text-sm text-zinc-500 border border-dashed border-zinc-800/50 rounded-xl bg-zinc-900/20">
            No records found.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="group flex items-center justify-between p-3 md:p-4 rounded-xl border border-zinc-800/40 bg-zinc-900/30 hover:bg-zinc-800/40 transition-colors">
              <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => handleEdit(entry)}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${entry.type === 'Income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {entry.type === 'Income' ? '+' : '-'}
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200">{entry.description}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                    <span>{entry.date}</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                    <span className="text-amber-500/80">{entry.category}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                {deleteId === entry.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400 mr-2">Delete?</span>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>No</Button>
                    <Button size="sm" className="bg-red-500/20 text-red-400 hover:bg-red-500/30" onClick={() => {
                       deleteMoneyEntry(entry.id);
                       setDeleteId(null);
                    }}>Yes</Button>
                  </div>
                ) : (
                  <>
                    <div className={`font-mono text-sm md:text-base font-medium ${entry.type === 'Income' ? 'text-emerald-400' : 'text-zinc-300'}`}>
                      ${entry.amount.toFixed(2)}
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setDeleteId(entry.id); }}
                      className="opacity-100 md:opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
