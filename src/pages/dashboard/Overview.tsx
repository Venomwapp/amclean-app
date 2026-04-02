import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Users, CalendarDays, TrendingUp, Flame, ThermometerSun, Snowflake,
  Euro, FileText, Clock, AlertTriangle, ArrowUpRight, Building2,
  ArrowRight, Bot, Info,
} from 'lucide-react';
import { Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const AGENT_PIPELINE = [
  { key: 'sophie', label: 'Sophie', emoji: '🔍', color: 'violet', role: 'Prospecção', tooltip: 'Busca novos leads via Google Maps e redes sociais automaticamente' },
  { key: 'claire', label: 'Claire', emoji: '💬', color: 'blue', role: 'Qualificação', tooltip: 'Qualifica leads via WhatsApp, coleta informações e agenda visitas' },
  { key: 'lucas', label: 'Lucas', emoji: '📄', color: 'amber', role: 'Propostas', tooltip: 'Gera orçamentos após visitas e envia propostas ao cliente' },
  { key: 'emma', label: 'Emma', emoji: '⭐', color: 'emerald', role: 'Fidelização', tooltip: 'Acompanha clientes ativos com pesquisas NPS e pós-venda' },
];

const AGENT_COLOR_MAP: Record<string, string> = {
  sophie: 'border-violet-500/30 bg-violet-500/5',
  claire: 'border-blue-500/30 bg-blue-500/5',
  lucas: 'border-amber-500/30 bg-amber-500/5',
  emma: 'border-emerald-500/30 bg-emerald-500/5',
};

const AGENT_TEXT_MAP: Record<string, string> = {
  sophie: 'text-violet-400',
  claire: 'text-blue-400',
  lucas: 'text-amber-400',
  emma: 'text-emerald-400',
};

const Overview = () => {
  const { t } = useTranslation();
  const [data, setData] = useState({
    totalLeads: 0, hotLeads: 0, warmLeads: 0, coldLeads: 0,
    newLeadsThisWeek: 0, convertedLeads: 0, lostLeads: 0,
    appointmentsThisWeek: 0, appointmentsToday: 0,
    totalEmployees: 0, activeSites: 0,
    totalRevenue: 0, pendingInvoices: 0, overdueInvoices: 0, paidThisMonth: 0,
    conversionRate: 0,
    statusData: [] as { name: string; count: number }[],
    weeklyLeads: [] as { day: string; count: number }[],
    agentPerformance: [] as { agent: string; messages: number; leads: number }[],
    leadsByAgent: {} as Record<string, number>,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [urgentItems, setUrgentItems] = useState<any[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59);
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [leadsRes, apptsRes, apptsWeekRes, employeesRes, sitesRes, invoicesRes, msgsRes, recentMsgsRes] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('appointments').select('*').gte('datetime', todayStart.toISOString()).lte('datetime', todayEnd.toISOString()),
        supabase.from('appointments').select('*').gte('datetime', weekStart.toISOString()).lte('datetime', weekEnd.toISOString()),
        supabase.from('employees').select('id').eq('is_active', true),
        supabase.from('client_sites').select('id').eq('is_active', true),
        supabase.from('invoices').select('*'),
        supabase.from('conversations').select('agent, role, lead_id').eq('role', 'assistant'),
        supabase.from('conversations').select('*, leads(contact_name, company_name, whatsapp_number)').order('created_at', { ascending: false }).limit(15),
      ]);

      const leads = leadsRes.data || [];
      const invoices = invoicesRes.data || [];
      const msgs = msgsRes.data || [];

      const hot = leads.filter(l => l.score === 'HOT').length;
      const warm = leads.filter(l => l.score === 'WARM').length;
      const cold = leads.filter(l => l.score === 'COLD').length;
      const converted = leads.filter(l => l.status === 'converted').length;
      const lost = leads.filter(l => l.status === 'lost').length;
      const newThisWeek = leads.filter(l => new Date(l.created_at) >= weekStart).length;

      // Leads by agent
      const leadsByAgent: Record<string, number> = { sophie: 0, claire: 0, lucas: 0, emma: 0 };
      leads.forEach(l => {
        const agent = l.active_agent || 'claire';
        if (leadsByAgent[agent] !== undefined) leadsByAgent[agent]++;
      });

      const statusMap: Record<string, number> = {};
      leads.forEach(l => { const s = l.status || 'new'; statusMap[s] = (statusMap[s] || 0) + 1; });
      const statusData = Object.entries(statusMap).map(([name, count]) => ({ name, count }));

      const weeklyLeads: { day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const dayStr = d.toLocaleDateString('fr-BE', { weekday: 'short' });
        const count = leads.filter(l => new Date(l.created_at).toDateString() === d.toDateString()).length;
        weeklyLeads.push({ day: dayStr, count });
      }

      const agentMap: Record<string, { messages: number; leads: Set<string> }> = {};
      msgs.forEach((m: any) => {
        const a = m.agent || 'claire';
        if (!agentMap[a]) agentMap[a] = { messages: 0, leads: new Set() };
        agentMap[a].messages++;
        agentMap[a].leads.add(m.lead_id);
      });
      const agentPerformance = Object.entries(agentMap).map(([agent, d]) => ({
        agent: agent.charAt(0).toUpperCase() + agent.slice(1), messages: d.messages, leads: d.leads.size,
      }));

      const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0);
      const pendingInvoices = invoices.filter(i => i.status === 'sent').length;
      const overdueInvoices = invoices.filter(i => i.status === 'overdue').length;
      const paidThisMonth = invoices.filter(i => i.status === 'paid' && i.paid_date && new Date(i.paid_date) >= monthStart).reduce((s, i) => s + Number(i.total || 0), 0);

      setData({
        totalLeads: leads.length, hotLeads: hot, warmLeads: warm, coldLeads: cold,
        newLeadsThisWeek: newThisWeek, convertedLeads: converted, lostLeads: lost,
        appointmentsThisWeek: (apptsWeekRes.data || []).length,
        appointmentsToday: (apptsRes.data || []).length,
        totalEmployees: (employeesRes.data || []).length,
        activeSites: (sitesRes.data || []).length,
        totalRevenue, pendingInvoices, overdueInvoices, paidThisMonth,
        conversionRate: leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0,
        statusData, weeklyLeads, agentPerformance, leadsByAgent,
      });

      const urgent: any[] = [];
      if (overdueInvoices > 0) urgent.push({ type: 'danger', text: `${overdueInvoices} ${t('dashboard.overview.overdue_invoices')}`, link: '/billing' });
      if (hot > 0) urgent.push({ type: 'hot', text: `${hot} ${t('dashboard.overview.hot_leads_waiting')}`, link: '/leads' });
      const pendingAppts = (apptsRes.data || []).filter((a: any) => a.status === 'scheduled');
      if (pendingAppts.length > 0) urgent.push({ type: 'info', text: `${pendingAppts.length} ${t('dashboard.overview.appts_to_confirm')}`, link: '/appointments' });
      setUrgentItems(urgent);
      setRecentActivity(recentMsgsRes.data || []);
    };

    fetchAll();
    const channel = supabase
      .channel('ceo-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [t]);

  const pieData = [
    { name: 'HOT', value: data.hotLeads, color: 'hsl(0, 84%, 60%)' },
    { name: 'WARM', value: data.warmLeads, color: 'hsl(38, 92%, 50%)' },
    { name: 'COLD', value: data.coldLeads, color: 'hsl(217, 91%, 60%)' },
  ].filter(d => d.value > 0);

  const tooltipStyle = {
    background: 'hsl(0 0% 7%)',
    border: '1px solid hsl(0 0% 18%)',
    borderRadius: '8px',
    color: 'hsl(0 0% 98%)',
    fontSize: '12px',
    padding: '8px 12px',
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-5 max-w-[1400px]">
      {/* Urgent Alerts */}
      {urgentItems.length > 0 && (
        <div className="space-y-1.5">
          {urgentItems.map((item, i) => (
            <Link key={i} to={item.link} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border transition-colors text-sm ${
              item.type === 'danger' ? 'bg-destructive/8 border-destructive/20 hover:border-destructive/40 text-destructive'
              : item.type === 'hot' ? 'bg-red-500/8 border-red-500/20 hover:border-red-500/40 text-red-400'
              : 'bg-accent/8 border-accent/20 hover:border-accent/40 text-accent'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-[13px]">{item.text}</span>
              <ArrowUpRight className="w-3 h-3 ml-auto opacity-50" />
            </Link>
          ))}
        </div>
      )}

      {/* Agent Pipeline */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-4 h-4 text-accent" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Pipeline de Agentes</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {AGENT_PIPELINE.map((agent, i) => (
            <Link
              key={agent.key}
              to={`/agents/${agent.key}`}
              className={`relative rounded-lg border p-4 transition-all hover:scale-[1.02] ${AGENT_COLOR_MAP[agent.key]}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{agent.emoji}</span>
                <div className="flex items-center gap-1.5">
                  <RadixTooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px] text-xs">
                      {agent.tooltip}
                    </TooltipContent>
                  </RadixTooltip>
                  <span className={`text-2xl font-mono font-bold ${AGENT_TEXT_MAP[agent.key]}`}>
                    {data.leadsByAgent[agent.key] || 0}
                  </span>
                </div>
              </div>
              <p className={`text-sm font-semibold ${AGENT_TEXT_MAP[agent.key]}`}>{agent.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{agent.role}</p>
              {i < 3 && (
                <ArrowRight className="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/30 z-10 hidden lg:block" />
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t('dashboard.overview.revenue'), value: `€${data.totalRevenue.toLocaleString('fr-BE', { minimumFractionDigits: 0 })}`, sub: `€${data.paidThisMonth.toLocaleString('fr-BE')} ${t('dashboard.overview.this_month')}`, icon: Euro, accent: 'text-emerald-400', tooltip: 'Total faturado com faturas pagas + valor pago este mês' },
          { label: t('dashboard.overview.pipeline'), value: data.totalLeads, sub: `+${data.newLeadsThisWeek} ${t('dashboard.overview.this_week')}`, icon: Users, accent: 'text-accent', tooltip: 'Total de leads no sistema + novos esta semana' },
          { label: t('dashboard.overview.conversion_rate'), value: `${data.conversionRate}%`, sub: `${data.convertedLeads} conv. / ${data.lostLeads} lost`, icon: TrendingUp, accent: 'text-violet-400', tooltip: 'Percentual de leads convertidos vs total no pipeline' },
          { label: t('dashboard.overview.operations'), value: data.activeSites, sub: `${data.totalEmployees} emp. • ${data.appointmentsToday} ${t('dashboard.overview.appts_today')}`, icon: Building2, accent: 'text-amber-400', tooltip: 'Sites ativos, funcionários e agendamentos de hoje' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border/50 bg-card/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{kpi.label}</span>
                <RadixTooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-xs">
                    {kpi.tooltip}
                  </TooltipContent>
                </RadixTooltip>
              </div>
              <kpi.icon className={`w-4 h-4 ${kpi.accent}`} />
            </div>
            <p className="text-2xl font-mono font-bold text-foreground">{kpi.value}</p>
            <p className={`text-[11px] mt-1 ${kpi.accent}`}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Score Badges */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: t('dashboard.overview.hot'), value: data.hotLeads, icon: Flame, color: 'text-red-400', bg: 'bg-red-500/8 border-red-500/20', tooltip: 'Leads com alta probabilidade de conversão' },
          { label: t('dashboard.overview.warm'), value: data.warmLeads, icon: ThermometerSun, color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/20', tooltip: 'Leads com interesse moderado, precisam de acompanhamento' },
          { label: t('dashboard.overview.cold'), value: data.coldLeads, icon: Snowflake, color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/20', tooltip: 'Leads com baixo engajamento ou sem resposta' },
          { label: t('dashboard.overview.appts_week'), value: data.appointmentsThisWeek, icon: CalendarDays, color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/20', tooltip: 'Visitas e chamadas agendadas para esta semana' },
          { label: t('dashboard.overview.invoices_due'), value: data.pendingInvoices, icon: FileText, color: 'text-orange-400', bg: 'bg-orange-500/8 border-orange-500/20', tooltip: 'Faturas enviadas aguardando pagamento' },
          { label: t('dashboard.overview.overdue'), value: data.overdueInvoices, icon: Clock, color: 'text-destructive', bg: 'bg-destructive/8 border-destructive/20', tooltip: 'Faturas vencidas e não pagas' },
        ].map(card => (
          <div key={card.label} className={`rounded-lg border p-3 text-center relative ${card.bg}`}>
            <RadixTooltip>
              <TooltipTrigger asChild>
                <Info className="w-2.5 h-2.5 text-muted-foreground/40 cursor-help absolute top-1.5 right-1.5" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[180px] text-xs">
                {card.tooltip}
              </TooltipContent>
            </RadixTooltip>
            <card.icon className={`w-3.5 h-3.5 mx-auto mb-1 ${card.color}`} />
            <p className={`text-lg font-mono font-bold ${card.color}`}>{card.value}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/50 bg-card/40 p-5">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-4">{t('dashboard.overview.leads_7days')}</h3>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={data.weeklyLeads}>
              <defs>
                <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(215, 55%, 45%)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(215, 55%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: 'hsl(0 0% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke="hsl(215, 55%, 45%)" fill="url(#leadGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/40 p-5">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-4">{t('dashboard.overview.scoring_pipeline')}</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">{t('dashboard.overview.no_scored_leads')}</div>
          )}
        </div>
        <div className="rounded-xl border border-border/50 bg-card/40 p-5">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-4">{t('dashboard.overview.ai_agents')}</h3>
          {data.agentPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={data.agentPerformance} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="agent" tick={{ fill: 'hsl(0 0% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="messages" fill="hsl(215, 55%, 45%)" radius={[0, 4, 4, 0]} name="Messages" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">{t('dashboard.overview.no_data')}</div>
          )}
        </div>
      </div>

      {/* Funnel + Activity */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/50 bg-card/40 p-5">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-4">{t('dashboard.overview.commercial_funnel')}</h3>
          {data.statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.statusData}>
                <XAxis dataKey="name" tick={{ fill: 'hsl(0 0% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(0 0% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(215, 55%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">{t('dashboard.overview.no_leads')}</div>
          )}
        </div>
        <div className="rounded-xl border border-border/50 bg-card/40 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">{t('dashboard.overview.realtime_activity')}</h3>
          </div>
          <div className="space-y-1 max-h-[220px] overflow-y-auto">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.overview.no_recent_activity')}</p>
            ) : (
              recentActivity.map((msg: any) => {
                const agentColor = AGENT_TEXT_MAP[msg.agent] || 'text-muted-foreground';
                return (
                  <div key={msg.id} className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary/30 transition-colors">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0 ${
                      msg.role === 'user' ? 'bg-accent/15 text-accent' : `${AGENT_COLOR_MAP[msg.agent]?.replace('bg-', 'bg-') || 'bg-secondary'}`
                    }`}>
                      {msg.role === 'user' ? 'U' : (msg.agent?.[0] || 'A').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-medium ${msg.role === 'user' ? 'text-foreground' : agentColor}`}>
                          {msg.role === 'user' ? (msg.leads?.contact_name || msg.leads?.whatsapp_number || 'Lead') : msg.agent?.charAt(0).toUpperCase() + msg.agent?.slice(1)}
                        </span>
                        <span className="text-[9px] text-muted-foreground/50">
                          {new Date(msg.created_at).toLocaleString('fr-BE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{msg.content}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
};

export default Overview;
