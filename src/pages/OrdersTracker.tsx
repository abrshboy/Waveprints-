import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Calculator, Wand2, Download } from "lucide-react";
import { Button, Card, Input, Label, Select } from "../components/ui";
import { useSettings, useOrders, useDailyCost } from "../hooks/useData";
import { addOrder, deleteOrder, updateOrder, getNextOrderId, updateDailyCost } from "../lib/api";
import { getDB, dbEvents } from "../lib/db";
import { OrderEntry } from "../types";
import { processOrderEntry } from "../lib/ai";

export default function OrdersTracker() {
  const settings = useSettings();
  const allOrders = useOrders();
  
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const dailyCost = useDailyCost(date);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<{id: string, date: string} | null>(null);

  const [product, setProduct] = useState("T-shirt");
  const [qty, setQty] = useState("1");
  const [matUnitCost, setMatUnitCost] = useState("");
  const [printUnitCost, setPrintUnitCost] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [tip, setTip] = useState("");
  const [delivery, setDelivery] = useState("");
  const [platform, setPlatform] = useState("");
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [aiTip, setAiTip] = useState<number | null>(null);
  const [aiDelivery, setAiDelivery] = useState<number | null>(null);

  useEffect(() => {
    if (!matUnitCost && settings.defaultMaterialUnitCost > 0) setMatUnitCost(String(settings.defaultMaterialUnitCost));
    if (!printUnitCost && settings.defaultPrintingUnitCost > 0) setPrintUnitCost(String(settings.defaultPrintingUnitCost));
    if (!platform && settings.platforms.length > 0) setPlatform(settings.platforms[0]);
  }, [settings]);

  const numQty = parseInt(qty) || 1;
  const numMatUnit = parseFloat(matUnitCost) || 0;
  const numPrintUnit = parseFloat(printUnitCost) || 0;
  
  const calcMatCost = numQty * numMatUnit;
  const calcPrintCost = numQty * numPrintUnit;

  const handleSharedCostUpdate = async (field: "transport_cost" | "other_cost", val: string) => {
    const num = parseFloat(val) || 0;
    await updateDailyCost({ ...dailyCost, [field]: num });
  };

  const handleProcess = async () => {
    if (!note) return;
    setIsProcessing(true);
    setIsOfflineMode(false);
    setAiTip(null);
    setAiDelivery(null);

    const result = await processOrderEntry(note, settings.geminiApiKey);
    if (result.note_clean) setNote(result.note_clean);
    
    if (result.tip > 0) {
      setTip(String(result.tip));
      setAiTip(result.tip);
    }
    if (result.delivery > 0) {
      setDelivery(String(result.delivery));
      setAiDelivery(result.delivery);
    }
    setIsOfflineMode(result.isOffline);
    setIsProcessing(false);
  };

  const handleEdit = (order: OrderEntry) => {
    setEditingId(order.order_id);
    setDate(order.date);
    setProduct(order.product);
    setQty(String(order.qty));
    setMatUnitCost(String(order.material_unit_cost));
    setPrintUnitCost(String(order.printing_unit_cost));
    setSellPrice(String(order.selling_price));
    setTip(String(order.tip || ""));
    setDelivery(String(order.delivery_fee || ""));
    setPlatform(order.platform);
    setNote(order.note || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellPrice) return;
    
    if (editingId) {
      const existing = allOrders.find(o => o.order_id === editingId);
      if (existing) {
        await updateOrder({
          ...existing,
          date, product, qty: numQty,
          material_unit_cost: numMatUnit, material_cost: calcMatCost,
          printing_unit_cost: numPrintUnit, printing_cost: calcPrintCost,
          selling_price: parseFloat(sellPrice) || 0,
          tip: parseFloat(tip) || 0, delivery_fee: parseFloat(delivery) || 0,
          platform, note, updated_at: Date.now()
        });
      }
      setEditingId(null);
    } else {
      const nextId = await getNextOrderId();
      const newOrder: OrderEntry = {
        order_id: nextId,
        date,
        product,
        qty: numQty,
        material_unit_cost: numMatUnit,
        material_cost: calcMatCost,
        printing_unit_cost: numPrintUnit,
        printing_cost: calcPrintCost,
        transport_cost: 0, // will be computed in api layer
        other_cost: 0,     // will be computed in api layer
        total_cost: 0,     // will be computed
        selling_price: parseFloat(sellPrice) || 0,
        tip: parseFloat(tip) || 0,
        delivery_fee: parseFloat(delivery) || 0,
        net_profit: 0,     // will be computed
        platform,
        note,
        synced: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      await addOrder(newOrder);
    }
    
    // Save defaults
    const db = await getDB();
    const updatedSettings = { 
      ...settings, 
      defaultMaterialUnitCost: numMatUnit, 
      defaultPrintingUnitCost: numPrintUnit 
    };
    await db.put("settings", updatedSettings);
    dbEvents.notify();

    // Reset some form fields
    setQty("1");
    setSellPrice("");
    setTip("");
    setDelivery("");
    setNote("");
    setAiTip(null);
    setAiDelivery(null);
    setIsOfflineMode(false);
  };

  // Only show today's orders in the list, or all if we grouped them.
  // The user wants a table of past orders, newest first.
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Order Tracker</h2>
        <p className="text-sm text-zinc-400 mt-1">Manage print-on-demand orders and compute net profit.</p>
      </header>

      {/* Date & Shared Costs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 border-amber-500/20 bg-amber-500/5">
          <Label className="text-amber-500 mb-2 block">Active Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="text-[10px] text-zinc-500 mt-2">Shared costs below apply to all orders on this date.</p>
        </Card>

        <Card className="lg:col-span-2 grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-2 block flex items-center gap-2">
              <Calculator className="w-3 h-3" />
              Daily Transport Cost
            </Label>
            <Input 
              type="number" step="0.01" min="0" placeholder="0.00"
              value={dailyCost.transport_cost || ""}
              onChange={(e) => handleSharedCostUpdate("transport_cost", e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-2 block flex items-center gap-2">
              <Calculator className="w-3 h-3" />
              Daily Other Cost
            </Label>
            <Input 
              type="number" step="0.01" min="0" placeholder="0.00"
              value={dailyCost.other_cost || ""}
              onChange={(e) => handleSharedCostUpdate("other_cost", e.target.value)}
            />
          </div>
        </Card>
      </div>

      {/* Order Entry Form */}
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-200 border-b border-zinc-800/50 pb-2 mb-4">New Order Details</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5 col-span-2 md:col-span-1">
              <Label>Product</Label>
              <Input value={product} onChange={(e) => setProduct(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {settings.platforms.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800/50">
            <div className="space-y-4">
               <div>
                  <Label className="text-zinc-400">Unit Costs</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <Input type="number" step="0.01" min="0" placeholder="Material" value={matUnitCost} onChange={(e) => setMatUnitCost(e.target.value)} title="Material Unit Cost" />
                    <Input type="number" step="0.01" min="0" placeholder="Printing" value={printUnitCost} onChange={(e) => setPrintUnitCost(e.target.value)} title="Printing Unit Cost" />
                  </div>
               </div>
               <div>
                  <Label className="text-zinc-400">Revenue</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <Input type="number" step="0.01" min="0" placeholder="Price" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required title="Selling Price" />
                    <Input type="number" step="0.01" min="0" placeholder="Tip" value={tip} onChange={(e) => setTip(e.target.value)} title="Tip" />
                    <Input type="number" step="0.01" min="0" placeholder="Delivery" value={delivery} onChange={(e) => setDelivery(e.target.value)} title="Delivery Fee" />
                  </div>
               </div>
            </div>

            <div className="space-y-1.5 pl-4 md:pl-8 border-l border-zinc-800/50 flex flex-col justify-center">
               <Label className="text-zinc-500">Computed Base Material Cost:</Label>
               <div className="text-sm font-mono text-zinc-300">${calcMatCost.toFixed(2)}</div>
               <div className="h-2"></div>
               <Label className="text-zinc-500">Computed Base Print Cost:</Label>
               <div className="text-sm font-mono text-zinc-300">${calcPrintCost.toFixed(2)}</div>
               <div className="mt-2 text-[10px] text-amber-500/60 leading-tight">Shared transport & other costs will be calculated upon save.</div>
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <Button type="submit" className="w-full md:w-auto shrink-0">
                <Plus className="w-4 h-4 mr-2" />
                {editingId ? "Update Order" : "Add Order"}
              </Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={() => {
                  setEditingId(null);
                  setQty("1"); setSellPrice(""); setTip(""); setDelivery(""); setNote("");
                }}>Cancel</Button>
              )}
              <div className="flex-1 flex gap-2 w-full">
                <Input placeholder="Note (optional / AI tip parsing)..." value={note} onChange={(e) => setNote(e.target.value)} className="bg-transparent border-0 border-b rounded-none focus:ring-0 focus:border-amber-500 px-0 h-8 text-sm" />
                <Button variant="secondary" size="sm" type="button" onClick={handleProcess} disabled={isProcessing || !note} className="shrink-0 h-8">
                  {isProcessing ? "..." : <><Wand2 className="w-3.5 h-3.5 mr-1" /> Process</>}
                </Button>
              </div>
            </div>
            {isOfflineMode && <div className="text-[10px] text-amber-500/60 md:text-right">Offline mode — basic cleanup applied</div>}
            {(aiTip !== null || aiDelivery !== null) && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-sm text-amber-500/90 md:text-right">
                AI detected {aiTip !== null ? <strong className="text-amber-400">Tip: ${aiTip}</strong> : ""}
                {aiTip !== null && aiDelivery !== null ? " and " : ""}
                {aiDelivery !== null ? <strong className="text-amber-400">Delivery: ${aiDelivery}</strong> : ""}.
                <span className="block text-xs mt-1 opacity-80">Please confirm values in the revenue fields above.</span>
              </div>
            )}
          </div>
        </form>
      </Card>

      <div className="space-y-3 mt-8">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Past Orders</h3>
        {allOrders.length === 0 ? (
          <div className="text-center p-8 text-sm text-zinc-500 border border-dashed border-zinc-800/50 rounded-xl bg-zinc-900/20">
            No orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
             <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50 border-b border-zinc-800">
                   <tr>
                      <th className="px-4 py-3 font-medium">Order ID</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium text-right">Revenue</th>
                      <th className="px-4 py-3 font-medium text-right">Total Cost</th>
                      <th className="px-4 py-3 font-medium text-right">Net Profit</th>
                      <th className="px-4 py-3"></th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 bg-zinc-900/20">
                  {allOrders.map(order => (
                    <tr key={order.order_id} className="hover:bg-zinc-800/30 transition-colors group cursor-pointer" onClick={() => handleEdit(order)}>
                      <td className="px-4 py-3 font-mono text-zinc-300">{order.order_id}</td>
                      <td className="px-4 py-3 text-zinc-400">{order.date}</td>
                      <td className="px-4 py-3 text-zinc-300">
                        {order.qty}x {order.product} <span className="text-[10px] text-zinc-500 ml-1">({order.platform})</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400/80">
                        ${(order.selling_price + order.tip + order.delivery_fee).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div title={`Base: $${(order.material_cost + order.printing_cost).toFixed(2)}\nShared: $${order.transport_cost.toFixed(2)} Transport + $${order.other_cost.toFixed(2)} Other`} className="font-mono text-red-400/80 cursor-help">
                          ${order.total_cost.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          +${(order.transport_cost + order.other_cost).toFixed(2)} shared
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-amber-500">
                        ${order.net_profit.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {deleteId?.id === order.order_id ? (
                             <div className="flex items-center justify-end gap-2">
                                <span className="text-xs text-red-400 mr-2">Delete?</span>
                                <Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>No</Button>
                                <Button size="sm" className="bg-red-500/20 text-red-400 hover:bg-red-500/30" onClick={() => {
                                   deleteOrder(order.order_id, order.date);
                                   setDeleteId(null);
                                }}>Yes</Button>
                             </div>
                          ) : (
                            <button 
                              onClick={() => setDeleteId({ id: order.order_id, date: order.date })}
                              className="opacity-100 lg:opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
         )}
      </div>

    </div>
  );
}
