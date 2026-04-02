import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, Users, MessageSquare, Clock, Zap, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { differenceInHours } from 'date-fns';

interface AgentConfig {
  id: string;
  agent_name: string;
  display_name: string;
  is_active: boolean;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

interface LeadSummary {
  id: string;
  contact_name: string | null;
  company_name: string | null;
  status: string | null;
  score: string | null;
  updated_at: string;
  whatsapp_number: string | null;
  active_agent: string | null;
  last_message_at?: string;
  message_count?: number;
}

const AGENT_META: Record<string, { emoji: string; role: string; color: string; bgClass: string; borderClass: string; features: string[] }> = {
  sophie: {
    emoji: '🔍',
    role: 'Prospecção B2B',
    color: 'text-violet-400',
    bgClass: 'bg-violet-500/5',
    borderClass: 'border-violet-500/20 hover:border-violet-500/40',
    features: ['Outreach B2B', 'Qualificação Inicial', 'Transfer → Claire'],
  },
  claire: {
    emoji: '💬',
    role: 'Qualificação & Vendas',
    color: 'text-blue-400',
    bgClass: 'bg-blue-500/5',
    borderClass: 'border-blue-500/20 hover:border-blue-500/40',
    features: ['Scoring HOT/WARM/COLD', 'Agendamento RDV', 'Follow-ups (3x)', 'Fechamento'],
  },
  lucas: {
    emoji: '📄',
    role: 'Propostas Pós-Visita',
    color: 'text-amber-400',
    bgClass: 'bg-amber-500/5',
    borderClass: 'border-amber-500/20 hover:border-amber-500/40',
    features: ['Confirmação Pós-Visita', 'Envio de Proposta', 'Transfer → Claire'],
  },
  emma: {
    emoji: '⭐',
    role: 'Customer Success',
    color: 'text-emerald-400',
    bgClass: 'bg-emerald-500/5',
    borderClass: 'border-emerald-500/20 hover:border-emerald-500/40',
    features: ['Onboarding', 'NPS Mensal', 'Avis Google', 'Upsell & Referral'],
  },
};

const SCORE_COLORS: Record<string, string> = {
  HOT: 'bg-red-500/15 text-red-400 border-red-500/30',
  WARM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  COLD: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const PIPELINE_ORDER = ['sophie', 'claire', 'lucas', 'emma'];

const Agents = () => {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [leadsByAgent, setLeadsByAgent] = useState<Record<string, LeadSummary[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [agentsRes, leadsRes] = await Promise.all([
      supabase.from('agent_configs').select('*').order('agent_name'),
      supabase.from('leads').select('id, contact_name, company_name, status, score, updated_at, whatsapp_number, active_agent').neq('status', 'lost'),
    ]);

    if (agentsRes.data) setAgents(agentsRes.data);

    if (leadsRes.data) {
      const grouped: Record<string, LeadSummary[]> = {};
      for (const lead of leadsRes.data) {
        const agent = lead.active_agent || 'claire';
        if (!grouped[agent]) grouped[agent] = [];
        grouped[agent].push(lead);
      }

      const allLeadIds = leadsRes.data.map(l => l.id);
      if (allLeadIds.length > 0) {
        const { data: convData } = await supabase
          .from('conversations')
          .select('lead_id, created_at')
          .in('lead_id', allLeadIds)
          .order('created_at', { ascending: false });

        if (convData) {
          const lastMsg: Record<string, { at: string; count: number }> = {};
          for (const c of convData) {
            if (!lastMsg[c.lead_id]) lastMsg[c.lead_id] = { at: c.created_at, count: 1 };
            else lastMsg[c.lead_id].count++;
          }
          for (const agent of Object.keys(grouped)) {
            for (const lead of grouped[agent]) {
              if (lastMsg[lead.id]) {
                lead.last_message_at = lastMsg[lead.id].at;
                lead.message_count = lastMsg[lead.id].count;
              }
            }
          }
        }
      }
      setLeadsByAgent(grouped);
    }
    setLoading(false);
  };

  const getStats = (agentName: string) => {
    const leads = leadsByAgent[agentName] || [];
    const now = new Date();
    const stuck = leads.filter(l => {
      const last = l.last_message_at || l.updated_at;
      return differenceInHours(now, new Date(last)) > 48;
    }).length;
    const active = leads.length - stuck;
    const totalMsgs = leads.reduce((s, l) => s + (l.message_count || 0), 0);
    return { total: leads.length, active, stuck, totalMsgs };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Sort agents in pipeline order
  const sortedAgents = [...agents].sort((a, b) =>
    PIPELINE_ORDER.indexOf(a.agent_name) - PIPELINE_ORDER.indexOf(b.agent_name)
  );

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Pipeline Flow */}
      <div className="flex items-center gap-2 justify-center py-3">
        {PIPELINE_ORDER.map((name, i) => {
          const meta = AGENT_META[name];
          return (
            <div key={name} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${meta.borderClass} ${meta.bgClass}`}>
                <span className="text-sm">{meta.emoji}</span>
                <span className={`text-xs font-medium ${meta.color}`}>{name.charAt(0).toUpperCase() + name.slice(1)}</span>
              </div>
              {i < 3 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30" />}
            </div>
          );
        })}
      </div>

      {/* Agent Cards - 2x2 Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {sortedAgents.map(agent => {
          const meta = AGENT_META[agent.agent_name] || AGENT_META.claire;
          const stats = getStats(agent.agent_name);
          const leads = leadsByAgent[agent.agent_name] || [];
          const recentLeads = leads
            .sort((a, b) => new Date(b.last_message_at || b.updated_at).getTime() - new Date(a.last_message_at || a.updated_at).getTime())
            .slice(0, 3);

          return (
            <div key={agent.id} className={`rounded-xl border ${meta.borderClass} ${meta.bgClass} transition-all`}>
              {/* Header */}
              <div className="p-5 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{meta.emoji}</span>
                    <div>
                      <h3 className={`text-base font-semibold ${meta.color}`}>{agent.display_name}</h3>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{meta.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${agent.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-[10px] text-muted-foreground">{agent.is_active ? 'ON' : 'OFF'}</span>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Leads', value: stats.total, icon: Users },
                    { label: 'Ativos', value: stats.active, icon: Zap },
                    { label: 'Parados', value: stats.stuck, icon: Clock, warn: stats.stuck > 0 },
                    { label: 'Msgs', value: stats.totalMsgs, icon: MessageSquare },
                  ].map(s => (
                    <div key={s.label} className="text-center py-2 rounded-lg bg-background/30">
                      <s.icon className={`w-3 h-3 mx-auto mb-1 ${s.warn ? 'text-amber-400' : 'text-muted-foreground/60'}`} />
                      <p className={`text-sm font-mono font-bold ${s.warn ? 'text-amber-400' : 'text-foreground'}`}>{s.value}</p>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div className="px-5 pb-3">
                <div className="flex flex-wrap gap-1.5">
                  {meta.features.map(f => (
                    <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-background/40 text-muted-foreground border border-border/30">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recent Leads */}
              <div className="border-t border-border/30 px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Últimos leads</p>
                  <Link to={`/agents/${agent.agent_name}`} className={`flex items-center gap-1 text-[10px] ${meta.color} hover:underline`}>
                    Ver todos <Eye className="w-3 h-3" />
                  </Link>
                </div>
                {recentLeads.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/50 py-2">Nenhum lead</p>
                ) : (
                  <div className="space-y-1.5">
                    {recentLeads.map(lead => {
                      const hours = differenceInHours(new Date(), new Date(lead.last_message_at || lead.updated_at));
                      return (
                        <div key={lead.id} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${meta.bgClass} ${meta.color}`}>
                              {(lead.contact_name || lead.company_name || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[12px] text-foreground">{lead.contact_name || lead.company_name || lead.whatsapp_number || 'Anônimo'}</p>
                              <p className="text-[9px] text-muted-foreground">{lead.message_count || 0} msgs</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {lead.score && (
                              <Badge className={`text-[8px] px-1.5 py-0 h-4 border ${SCORE_COLORS[lead.score] || ''}`}>{lead.score}</Badge>
                            )}
                            <span className="text-[9px] text-muted-foreground">{hours < 1 ? 'now' : `${hours}h`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Stuck Alert */}
              {stats.stuck > 0 && (
                <div className="border-t border-amber-500/20 bg-amber-500/5 px-5 py-2.5 flex items-center gap-2 rounded-b-xl">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] text-amber-400 font-medium">{stats.stuck} lead{stats.stuck > 1 ? 's' : ''} parado{stats.stuck > 1 ? 's' : ''} há +48h</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Agents;
