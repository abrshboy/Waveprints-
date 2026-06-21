import { useState, useMemo, useEffect } from "react";
import { format, subDays, subWeeks, subMonths, isSameDay, isSameWeek, isSameMonth, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { TrendingUp, TrendingDown, AlertTriangle, Wand2 } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Card } from "../components/ui";
import { useSettings, useMoneyEntries, useOrders } from "../hooks/useData";
import { generateAIRecap } from "../lib/ai";

type Period = "Daily" | "Weekly" | "Monthly";

export default function Dashboard() {
  const settings = useSettings();
  const moneyEntries = useMoneyEntries();
  const orders = useOrders();

  const [period, setPeriod] = useState<Period>("Weekly");
  const [recap, setRecap] = useState<string | null>(null);
  const [loadingRecap, setLoadingRecap] = useState(false);

  // Derive Current & Previous date intervals
  const now = new Date();
  
  const { currentInterval, prevInterval, trendPoints } = useMemo(() => {
    let currentInterval = { start: now, end: now };
    let prevInterval = { start: now, end: now };
    let trendPoints: { dateLabel: string; valueRaw: Date }[] = [];

    if (period === "Daily") {
      currentInterval = { start: now, end: now };
      prevInterval = { start: subDays(now, 1), end: subDays(now, 1) };
      // Trend: past 7 days
      trendPoints = Array.from({ length: 7 }).map((_, i) => {
        const d = subDays(now, 6 - i);
        return { dateLabel: format(d, "MMM dd"), valueRaw: d };
      });
    } else if (period === "Weekly") {
      currentInterval = { start: startOfWeek(now), end: endOfWeek(now) };
      const prevWeekStart = subWeeks(startOfWeek(now), 1);
      prevInterval = { start: prevWeekStart, end: endOfWeek(prevWeekStart) };
      // Trend: Days of this week
      trendPoints = eachDayOfInterval(currentInterval).map(d => ({
        dateLabel: format(d, "EEE"), valueRaw: d
      }));
    } else if (period === "Monthly") {
      currentInterval = { start: startOfMonth(now), end: endOfMonth(now) };
      const prevMonthStart = subMonths(startOfMonth(now), 1);
      prevInterval = { start: prevMonthStart, end: endOfMonth(prevMonthStart) };
      // Trend: Weeks of this month
      trendPoints = eachWeekOfInterval(currentInterval).map((d, i) => ({
        dateLabel: `Week ${i + 1}`, valueRaw: d // approximate
      }));
    }

    return { currentInterval, prevInterval, trendPoints };
  }, [period]); // ignore warning since we always base on "now"

  const checkInInterval = (dateStr: string, intervalStart: Date, intervalEnd: Date, p: Period) => {
    const d = parseISO(dateStr);
    if (p === "Daily") return isSameDay(d, intervalStart);
    if (p === "Weekly") return isSameWeek(d, intervalStart);
    if (p === "Monthly") return isSameMonth(d, intervalStart);
    return false;
  };

  const getStats = (dateStart: Date, dateEnd: Date) => {
    const periodOrders = orders.filter(o => checkInInterval(o.date, dateStart, dateEnd, period));
    const periodMoney = moneyEntries.filter(m => checkInInterval(m.date, dateStart, dateEnd, period));

    let income = 0;
    let expense = 0;
    
    // Aggregate Platform Sales for Recap
    const platformSales: Record<string, number> = {};

    periodOrders.forEach(o => {
      income += o.selling_price + o.tip + o.delivery_fee;
      expense += o.total_cost;
      platformSales[o.platform] = (platformSales[o.platform] || 0) + o.qty;
    });

    // Expense breakdown array
    const expenseBreakdown: Record<string, number> = {};
    if (periodOrders.length > 0) {
      expenseBreakdown["Order Costs"] = periodOrders.reduce((sum, o) => sum + o.total_cost, 0);
    }

    periodMoney.forEach(m => {
      if (m.type === "Income") income += m.amount;
      if (m.type === "Expense") {
        expense += m.amount;
        expenseBreakdown[m.category] = (expenseBreakdown[m.category] || 0) + m.amount;
      }
    });

    const profit = income - expense;

    let bestPlatform = "None";
    let max = 0;
    Object.entries(platformSales).forEach(([plat, qty]) => {
      if (qty > max) { max = qty; bestPlatform = plat; }
    });

    const breakdownArr = Object.entries(expenseBreakdown)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { income, expense, profit, periodOrders, periodMoney, bestPlatform, platformSales, expenseBreakdown: breakdownArr };
  };

  const currStats = useMemo(() => getStats(currentInterval.start, currentInterval.end), [currentInterval, orders, moneyEntries, period]);
  const prevStats = useMemo(() => getStats(prevInterval.start, prevInterval.end), [prevInterval, orders, moneyEntries, period]);

  // Alert Orders
  const alertOrders = useMemo(() => {
    const threshold = (settings.minProfitMargin || 35) / 100;
    return currStats.periodOrders.filter(o => {
      const revenue = o.selling_price + o.tip + o.delivery_fee;
      if (revenue === 0) return false;
      return (o.net_profit / revenue) < threshold;
    });
  }, [currStats.periodOrders, settings.minProfitMargin]);

  // Trend Chart Data
  const trendData = useMemo(() => {
    return trendPoints.map(point => {
      // Find orders & money entries falling into this point's bucket
      let inc = 0;
      let exp = 0;
      
      const filterForBucket = (dateStr: string) => {
        const d = parseISO(dateStr);
        if (period === "Daily") return isSameDay(d, point.valueRaw); // group by day
        if (period === "Weekly") return isSameDay(d, point.valueRaw); // group by day of week
        if (period === "Monthly") return isSameWeek(d, point.valueRaw); // group by week
        return false;
      };

      orders.filter(o => filterForBucket(o.date)).forEach(o => {
        inc += o.selling_price + o.tip + o.delivery_fee;
        exp += o.total_cost;
      });
      moneyEntries.filter(m => filterForBucket(m.date)).forEach(m => {
        if (m.type === "Income") inc += m.amount;
        if (m.type === "Expense") exp += m.amount;
      });

      return {
        name: point.dateLabel,
        Income: Number(inc.toFixed(2)),
        Expense: Number(exp.toFixed(2))
      };
    });
  }, [trendPoints, orders, moneyEntries, period]);

  useEffect(() => {
    let isMounted = true;
    async function fetchRecap() {
      if (currStats.income === 0 && currStats.expense === 0) {
        if (isMounted) setRecap("No data to summarize for this period yet.");
        return;
      }
      setLoadingRecap(true);
      const res = await generateAIRecap(period, currStats, currStats.platformSales, settings.geminiApiKey);
      if (isMounted && res) setRecap(res);
      if (isMounted) setLoadingRecap(false);
    }
    fetchRecap();
    return () => { isMounted = false; };
  }, [period, currStats.income, currStats.expense]); // re-fetch if period changes, or if numbers change significantly (maybe debounce?)

  // Chart config
  const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#64748b'];

  const StatDelta = ({ curr, prev }: { curr: number, prev: number }) => {
    if (prev === 0) return <span className="text-zinc-500 text-xs ml-2">—</span>;
    const diff = curr - prev;
    const isPos = diff >= 0;
    return (
      <span className={`text-xs font-medium ml-2 flex items-center ${isPos ? "text-emerald-400" : "text-red-400"}`}>
        {isPos ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
        {Math.abs(diff / prev * 100).toFixed(0)}%
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Dashboard</h2>
          <p className="text-sm text-zinc-400 mt-1">Financial overview and insights.</p>
        </div>
        
        <div className="flex p-1 bg-zinc-900/80 rounded-lg border border-zinc-800 self-start md:self-auto shrink-0 mt-2 md:mt-0">
          {(["Daily", "Weekly", "Monthly"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${period === p ? "bg-zinc-800 text-amber-500 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-zinc-400 font-medium mb-1">Total Income</div>
          <div className="flex items-baseline">
            <span className="text-3xl font-semibold text-zinc-100">${currStats.income.toFixed(2)}</span>
            <StatDelta curr={currStats.income} prev={prevStats.income} />
          </div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-400 font-medium mb-1">Total Expense</div>
          <div className="flex items-baseline">
            <span className="text-3xl font-semibold text-zinc-100">${currStats.expense.toFixed(2)}</span>
            <StatDelta curr={currStats.expense} prev={prevStats.expense} />
          </div>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <div className="text-sm text-amber-500/80 font-medium mb-1">Net Profit</div>
          <div className="flex items-baseline">
            <span className="text-3xl font-semibold text-amber-500">${currStats.profit.toFixed(2)}</span>
            <StatDelta curr={currStats.profit} prev={prevStats.profit} />
          </div>
        </Card>
      </div>

      {navigator.onLine && (recap || loadingRecap) && (
        <Card className="bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/20 relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-amber-500/20 p-2 rounded-full">
            <Wand2 className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-sm font-semibold text-amber-500 mb-2">AI Recap</h3>
          {loadingRecap ? (
            <div className="space-y-2 animate-pulse mt-2 pr-12">
              <div className="h-4 bg-amber-500/20 rounded w-full"></div>
              <div className="h-4 bg-amber-500/20 rounded w-5/6"></div>
            </div>
          ) : (
            <p className="text-sm text-zinc-300 leading-relaxed pr-12">{recap}</p>
          )}
        </Card>
      )}

      {alertOrders.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 md:p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
               <h3 className="text-sm font-semibold text-red-400">Low Margin Alerts</h3>
               <p className="text-xs text-red-400/80 mt-1 mb-3">
                 The following orders fell below your {settings.minProfitMargin}% net profit margin threshold:
               </p>
               <div className="space-y-2">
                 {alertOrders.map(o => {
                   const revenue = o.selling_price + o.tip + o.delivery_fee;
                   const margin = ((o.net_profit / revenue) * 100).toFixed(1);
                   return (
                     <div key={o.order_id} className="text-sm text-red-200 bg-red-950/50 p-2 rounded border border-red-500/20 flex justify-between items-center">
                       <span><strong>{o.order_id}</strong> <span className="opacity-70 text-xs ml-2">{o.date}</span></span>
                       <span className="font-mono text-xs">{margin}% margin <span className="opacity-50">(${o.net_profit.toFixed(2)} profit)</span></span>
                     </div>
                   );
                 })}
               </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        <Card>
          <h3 className="text-sm font-medium text-zinc-200 mb-6 flex justify-between">
            Income vs Expense
            <span className="text-xs text-zinc-500 font-normal">Trend</span>
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '13px' }}
                  itemStyle={{ color: '#e4e4e7' }}
                />
                <Line type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 0, fill: '#10b981' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Expense" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, strokeWidth: 0, fill: '#f43f5e' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-medium text-zinc-200 mb-6 flex justify-between">
            Expense Breakdown
            <span className="text-xs text-zinc-500 font-normal">By Category</span>
          </h3>
          {currStats.expenseBreakdown.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-sm text-zinc-500">No expenses this period.</div>
          ) : (
            <div className="h-[250px] w-full border-t border-zinc-800/30 pt-4 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={currStats.expenseBreakdown}
                    cx="40%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {currStats.expenseBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '13px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={(val: number) => `$${val.toFixed(2)}`}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-4 right-0 w-[45%] h-full overflow-y-auto pr-2 space-y-3 pb-8 scrollbar-hide">
                 {currStats.expenseBreakdown.map((item, i) => (
                   <div key={item.name} className="flex justify-between items-center text-xs">
                     <div className="flex items-center gap-2 truncate pr-2">
                       <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                       <span className="text-zinc-300 truncate">{item.name}</span>
                     </div>
                     <span className="text-zinc-400 font-mono">${item.value.toFixed(2)}</span>
                   </div>
                 ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
