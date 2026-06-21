import React, { useEffect, useState } from "react";
import AppLayout from "./components/layout/AppLayout";
import { initSettings, getDB } from "./lib/db";
import { initFirebase, syncData } from "./lib/sync";

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function setup() {
      await initSettings();
      const localDb = await getDB();
      const settings = await localDb.get("settings", "global");
      
      if (settings?.firebaseConfig?.projectId) {
        initFirebase(settings.firebaseConfig);
        syncData();
        
        // Sync every 30 seconds
        setInterval(() => {
          if (navigator.onLine) syncData();
        }, 30000);
      }
      
      setReady(true);
    }
    setup();
    
    const handleOnline = () => {
      syncData();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-zinc-950">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent flex rounded-full animate-spin"></div>
      </div>
    );
  }

  return <AppLayout />;
}
