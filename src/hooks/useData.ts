import { useState, useEffect } from "react";
import { dbEvents, getDB, defaultSettings } from "../lib/db";
import { MoneyEntry, OrderEntry, AppSettings, DailySharedCost } from "../types";
import { getMoneyEntries, getOrders, getDailyCost } from "../lib/api";

export function useSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  useEffect(() => {
    async function load() {
      const db = await getDB();
      const s = await db.get("settings", "global");
      if (s) setSettings(s);
    }
    load();
    const unsub = dbEvents.subscribe(load);
    return unsub;
  }, []);
  return settings;
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  useEffect(() => {
    async function load() {
      setOrders(await getOrders());
    }
    load();
    const unsub = dbEvents.subscribe(load);
    return unsub;
  }, []);
  return orders;
}

export function useMoneyEntries() {
  const [entries, setEntries] = useState<MoneyEntry[]>([]);
  useEffect(() => {
    async function load() {
      setEntries(await getMoneyEntries());
    }
    load();
    const unsub = dbEvents.subscribe(load);
    return unsub;
  }, []);
  return entries;
}

export function useDailyCost(date: string) {
  const [cost, setCost] = useState<DailySharedCost>({ date, transport_cost: 0, other_cost: 0 });
  useEffect(() => {
    if (!date) return;
    async function load() {
      setCost(await getDailyCost(date));
    }
    load();
    const unsub = dbEvents.subscribe(load);
    return unsub;
  }, [date]);
  return cost;
}
