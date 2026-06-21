import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, getDoc } from "firebase/firestore";
import { MoneyEntry, OrderEntry, FirebaseConfig } from "../types";
import { getDB, dbEvents } from "./db";

let dbInstance: any = null;
let syncInProgress = false;

export function initFirebase(config: FirebaseConfig) {
  if (!config.apiKey || !config.projectId) return false;
  try {
    const app = initializeApp(config);
    dbInstance = getFirestore(app);
    return true;
  } catch (err) {
    console.error("Firebase init err:", err);
    return false;
  }
}

export async function syncData() {
  if (!dbInstance || syncInProgress || !navigator.onLine) return;
  
  syncInProgress = true;
  dbEvents.notifySyncing(true);
  
  try {
    const localDb = await getDB();
    const moneyEntries = await localDb.getAll("money") as MoneyEntry[];
    const orderEntries = await localDb.getAll("orders") as OrderEntry[];
    
    // Sync Money Entries
    const moneyRef = collection(dbInstance, "money");
    const remoteMoneySnapshot = await getDocs(moneyRef);
    const remoteMoney = new Map(remoteMoneySnapshot.docs.map(d => [d.id, d.data() as MoneyEntry]));
    
    for (const local of moneyEntries) {
      const remote = remoteMoney.get(local.id);
      if (!remote || (local.updated_at || 0) > (remote.updated_at || 0)) {
        if (!local.synced) {
          await setDoc(doc(moneyRef, local.id), { ...local, synced: true });
          local.synced = true;
          await localDb.put("money", local);
        }
      } else if (remote && (remote.updated_at || 0) > (local.updated_at || 0)) {
        await localDb.put("money", remote);
      }
    }
    
    for (const [id, remote] of remoteMoney) {
      if (!moneyEntries.find(m => m.id === id)) {
        await localDb.put("money", remote);
      }
    }

    // Sync Order Entries
    const orderRef = collection(dbInstance, "orders");
    const remoteOrdersSnapshot = await getDocs(orderRef);
    const remoteOrders = new Map(remoteOrdersSnapshot.docs.map(d => [d.id, d.data() as OrderEntry]));
    
    for (const local of orderEntries) {
      const remote = remoteOrders.get(local.order_id);
      if (!remote || (local.updated_at || 0) > (remote.updated_at || 0)) {
        if (!local.synced) {
          await setDoc(doc(orderRef, local.order_id), { ...local, synced: true });
          local.synced = true;
          await localDb.put("orders", local);
        }
      } else if (remote && (remote.updated_at || 0) > (local.updated_at || 0)) {
        await localDb.put("orders", remote);
      }
    }
    
    for (const [id, remote] of remoteOrders) {
      if (!orderEntries.find(o => o.order_id === id)) {
        await localDb.put("orders", remote);
      }
    }
    
    dbEvents.notify();
  } catch (err) {
    console.error("Sync error:", err);
  } finally {
    syncInProgress = false;
    dbEvents.notifySyncing(false);
  }
}
