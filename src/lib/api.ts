import { v4 as uuidv4 } from "uuid";
import { getDB, dbEvents } from "./db";
import { DailySharedCost, OrderEntry, MoneyEntry } from "../types";

export async function addMoneyEntry(entry: any) {
  const db = await getDB();
  entry.updated_at = Date.now();
  entry.synced = false;
  await db.put("money", entry);
  dbEvents.notify();
}

export async function updateMoneyEntry(entry: MoneyEntry) {
  const db = await getDB();
  entry.updated_at = Date.now();
  entry.synced = false;
  await db.put("money", entry);
  dbEvents.notify();
}

export async function deleteMoneyEntry(id: string) {
  const db = await getDB();
  await db.delete("money", id);
  dbEvents.notify();
}

export async function getMoneyEntries() {
  const db = await getDB();
  const all = await db.getAll("money");
  return all.sort((a, b) => b.created_at - a.created_at);
}

export async function getNextOrderId() {
  const db = await getDB();
  const allOrders = await db.getAll("orders");
  if (allOrders.length === 0) return "ORD0001";
  
  // order by order_id desc
  const sorted = allOrders.map(o => parseInt(o.order_id.replace("ORD", ""))).sort((a, b) => b - a);
  const nextNum = sorted[0] + 1;
  return `ORD${nextNum.toString().padStart(4, "0")}`;
}

export async function addOrder(entry: OrderEntry) {
  const db = await getDB();
  entry.updated_at = Date.now();
  entry.synced = false;
  await db.put("orders", entry);
  
  await recalculateOrdersForDate(entry.date);
}

export async function updateOrder(entry: OrderEntry) {
  const db = await getDB();
  entry.updated_at = Date.now();
  entry.synced = false;
  await db.put("orders", entry);
  
  await recalculateOrdersForDate(entry.date);
}

export async function deleteOrder(order_id: string, date: string) {
  const db = await getDB();
  await db.delete("orders", order_id);
  
  await recalculateOrdersForDate(date);
}

export async function getOrders() {
  const db = await getDB();
  const all = await db.getAll("orders");
  return all.sort((a, b) => b.created_at - a.created_at);
}

export async function getDailyCost(date: string): Promise<DailySharedCost> {
  const db = await getDB();
  const cost = await db.get("daily_costs", date);
  return cost || { date, transport_cost: 0, other_cost: 0 };
}

export async function updateDailyCost(cost: DailySharedCost) {
  const db = await getDB();
  await db.put("daily_costs", cost);
  await recalculateOrdersForDate(cost.date);
}

async function recalculateOrdersForDate(date: string) {
  const db = await getDB();
  const tx = db.transaction(["orders", "daily_costs"], "readwrite");
  const ordersStore = tx.objectStore("orders");
  const costsStore = tx.objectStore("daily_costs");

  const dailyCost = await costsStore.get(date) || { date, transport_cost: 0, other_cost: 0 };
  
  const index = ordersStore.index("by-date");
  const ordersForDate = await index.getAll(date);
  
  if (ordersForDate.length > 0) {
    const transportPerOrder = Number((dailyCost.transport_cost / ordersForDate.length).toFixed(2));
    const otherPerOrder = Number((dailyCost.other_cost / ordersForDate.length).toFixed(2));
    
    // adjust remainder on first order to ensure sum is exact if needed, or just let it be close enough
    let t_remainder = dailyCost.transport_cost - (transportPerOrder * ordersForDate.length);
    let o_remainder = dailyCost.other_cost - (otherPerOrder * ordersForDate.length);

    for (let i = 0; i < ordersForDate.length; i++) {
        const o = ordersForDate[i];
        o.transport_cost = transportPerOrder + (i === 0 ? t_remainder : 0);
        o.other_cost = otherPerOrder + (i === 0 ? o_remainder : 0);
        
        o.total_cost = Number((o.material_cost + o.printing_cost + o.transport_cost + o.other_cost).toFixed(2));
        o.net_profit = Number((o.selling_price + o.tip + o.delivery_fee - o.total_cost).toFixed(2));
        
        ordersStore.put(o);
    }
  }
  
  await tx.done;
  dbEvents.notify();
}
