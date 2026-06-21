import { useState, useEffect } from "react";
import { LayoutDashboard, Wallet, ShoppingCart, Settings, Cloud, CloudOff, RefreshCw } from "lucide-react";
import DashboardStr from "../../pages/Dashboard";
import MoneyTracker from "../../pages/MoneyTracker";
import OrdersTracker from "../../pages/OrdersTracker";
import SettingsPage from "../../pages/Settings";
import { dbEvents } from "../../lib/db";
import { useSettings } from "../../hooks/useData";

function SyncIndicator() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const settings = useSettings();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    const unsubscribe = dbEvents.subscribeSync(setIsSyncing);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

  if (!settings.firebaseConfig || !settings.firebaseConfig.projectId) return null;

  return (
    <div className="absolute top-4 right-4 md:fixed flex items-center gap-2 text-xs font-medium bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 px-3 py-1.5 rounded-full z-10 shadow-sm pointer-events-none">
      {!isOnline ? (
        <><CloudOff className="w-3.5 h-3.5 text-zinc-500" /><span className="text-zinc-500">Offline</span></>
      ) : isSyncing ? (
        <><RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" /><span className="text-amber-500">Syncing</span></>
      ) : (
        <><Cloud className="w-3.5 h-3.5 text-emerald-500" /><span className="text-zinc-400">Synced</span></>
      )}
    </div>
  );
}

export default function AppLayout() {
  const [activeTab, setActiveTab] = useState("orders");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "money", label: "Money", icon: Wallet },
    { id: "orders", label: "Orders", icon: ShoppingCart },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full bg-zinc-950 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-zinc-800/50 bg-zinc-950/50">
        <div className="p-6">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>
            Threadline
          </h1>
        </div>
        <nav className="flex-1 space-y-1 px-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-800/80 text-amber-500"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-amber-500" : ""}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-[calc(100vh-64px)] md:h-screen w-full overflow-y-auto overflow-x-hidden relative">
        <SyncIndicator />
        <div className="p-4 md:p-8 md:max-w-4xl mx-auto w-full pb-24 md:pb-8">
          {activeTab === "dashboard" && <DashboardStr />}
          {activeTab === "money" && <MoneyTracker />}
          {activeTab === "orders" && <OrdersTracker />}
          {activeTab === "settings" && <SettingsPage />}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-zinc-800/50 bg-zinc-950/90 backdrop-blur-lg px-2 pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
                isActive ? "text-amber-500" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
