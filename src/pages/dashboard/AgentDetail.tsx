import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Bot, Users, MessageSquare, AlertTriangle, CheckCircle, Clock, Activity, Zap,
  ArrowLeft, Send, Settings2, TrendingUp, Eye, Sparkles, Shield, FileCheck
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { differenceInHours, differenceInDays } from 'date-fns';
import { motion } from 'framer-motion';

const AGENT_META: Record<string, { gradient: string; border: string; text: string; bg: string; icon: string; role: string; description: string; features: string[] }> = {
  sophie: {
    gradient: 'from-violet-500/20 via-violet-500/5 to-transparent',
    border: 'border-violet-500/20',
    text: 'text-violet-400',
    bg: 'bg-violet-500',
    icon: '🔍',
    role: 'Prospector B2B',
    description: 'Busca e qualifica empresas que precisam de serviços de limpeza',
    features: ['Outreach B2B', 'Validação de Interesse', 'Transfer → Claire', 'Prospecção Auto'],
  },
  claire: {
    gradient: 'from-blue-500/20 via-blue-500/5 to-transparent',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    bg: 'bg-blue-500',
    icon: '📋',
    role: 'Closer & Vendas',
    description: 'Qualifica leads, agenda visitas/calls com Meyri e faz follow-up',
    features: ['Qualificação', 'Agendamento', 'Follow-ups (3x)', 'Scoring HOT/WARM/COLD'],
  },
  lucas: {
    gradient: 'from-amber-500/20 via-amber-500/5 to-transparent',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    bg: 'bg-amber-500',
    icon: '📄',
    role: 'Propostas Pós-Visita',
    description: 'Confirma detalhes pós-visita e prepara envio de proposta comercial',
    features: ['Confirmação Pós-Visita', 'Envio de Proposta', 'Ponte → Claire', 'Acompanhamento'],
  },
  emma: {
    gradient: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500',
    icon: '⭐',
    role: 'Customer Success',
    description: 'Satisfação, NPS, avis Google, upsell e programa de indicação',
    features: ['Onboarding', 'NPS Mensal', 'Avis Google', 'Upsell / Referral'],
  },
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Novo', qualifying: 'Qualificando', scheduled: 'Agendado',
  followup_1: 'Follow-up 1', followup_2: 'Follow-up 2', followup_3: 'Follow-up 3',
  converted: 'Convertido', lost: 'Perdido',
};

const SCORE_COLORS: Record<string, string> = {
  HOT: 'bg-red-500/20 text-red-400 border-red-500/30',
  WARM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  COLD: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const AgentDetail = () => {
  const { agentName } = useParams<{ agentName: string }>();
  const [agentConfig, setAgentConfig] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadMessages, setLeadMessages] = useState<any[]>([]);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [tempDraft, setTempDraft] = useState('');
  const [tokensDraft, setTokensDraft] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const meta = AGENT_META[agentName || ''] || AGENT_META.claire;

  useEffect(() => {
    if (!agentName) return;
    fetchAll();
  }, [agentName]);

  const fetchAll = async () => {
    setLoading(true);
    const [agentRes, leadsRes, convsRes] = await Promise.all([
      supabase.from('agent_configs').select('*').eq('agent_name', agentName! as any).single(),
      supabase.from('leads').select('*').eq('active_agent', agentName! as any).order('updated_at', { ascending: false }),
      supabase.from('conversations').select('*').eq('agent', agentName! as any).order('created_at', { ascending: false }).limit(200),
    ]);
    if (agentRes.data) {
      setAgentConfig(agentRes.data);
      setPromptDraft(agentRes.data.system_prompt);
      setTempDraft(String(agentRes.data.temperature));
      setTokensDraft(String(agentRes.data.max_tokens));
    }
    if (leadsRes.data) setLeads(leadsRes.data);
    if (convsRes.data) setConversations(convsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (!selectedLeadId) { setLeadMessages([]); return; }
    const fetch = async () => {
      const { data } = await supabase.from('conversations').select('*').eq('lead_id', selectedLeadId).order('created_at', { ascending: true });
      if (data) setLeadMessages(data);
    };
    fetch();
    const ch = supabase.channel(`agent-conv-${selectedLeadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `lead_id=eq.${selectedLeadId}` }, (p) => {
        setLeadMessages(prev => [...prev, p.new]);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedLeadId]);

  useEffect(() => {
    if (!agentName) return;
    const ch = supabase.channel(`agent-leads-${agentName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [agentName]);

  const saveConfig = async () => {
    if (!agentConfig) return;
    setSavingConfig(true);
    const { error } = await supabase.from('agent_configs').update({
      system_prompt: promptDraft,
      temperature: parseFloat(tempDraft) || 0.3,
      max_tokens: parseInt(tokensDraft) || 500,
    }).eq('id', agentConfig.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Configuração salva'); setEditingPrompt(false); fetchAll(); }
    setSavingConfig(false);
  };

  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date().toISOString().split('T')[0];
    const todayConvs = conversations.filter(c => c.created_at?.startsWith(today));
    const stuckLeads = leads.filter(l => differenceInHours(now, new Date(l.updated_at)) > 48);
    const activeLeads = leads.filter(l => differenceInHours(now, new Date(l.updated_at)) <= 48);
    return { total: leads.length, active: activeLeads.length, stuck: stuckLeads.length, totalMsgs: conversations.length, todayMsgs: todayConvs.length, stuckLeads, activeLeads };
  }, [leads, conversations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agentConfig) {
    return <div className="text-center py-20 text-muted-foreground">Agente não encontrado</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Gradient Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative rounded-2xl overflow-hidden border ${meta.border}`}
      >
        <div className={`absolute inset-0 bg-gradient-to-r ${meta.gradient}`} />
        <div className="relative px-6 py-5 flex items-center gap-5">
          <Link to="/agents" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-14 h-14 rounded-2xl bg-card/80 border border-white/10 flex items-center justify-center text-2xl">
            {meta.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className={`text-xl font-semibold ${meta.text}`}>{agentConfig.display_name}</h2>
              <Badge variant={agentConfig.is_active ? 'default' : 'destructive'} className="text-[10px] px-2">
                {agentConfig.is_active ? '● Ativo' : '○ Inativo'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            {meta.features.map(f => (
              <span key={f} className="text-[10px] bg-card/60 border border-white/[0.06] text-muted-foreground rounded-full px-2.5 py-1">
                {f}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Leads', value: stats.total, icon: Users, accent: meta.text },
          { label: 'Ativos (<48h)', value: stats.active, icon: Activity, accent: 'text-emerald-400' },
          { label: 'Parados (>48h)', value: stats.stuck, icon: AlertTriangle, accent: stats.stuck > 0 ? 'text-amber-400' : 'text-muted-foreground/40' },
          { label: 'Total Mensagens', value: stats.totalMsgs, icon: MessageSquare, accent: 'text-muted-foreground' },
          { label: 'Mensagens Hoje', value: stats.todayMsgs, icon: TrendingUp, accent: 'text-accent' },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card/40 border border-white/[0.06] rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`w-3.5 h-3.5 ${kpi.accent}`} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={`text-2xl font-mono font-bold ${kpi.accent}`}>{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="leads" className="w-full">
        <TabsList className="bg-card/60 border border-white/[0.06] p-1">
          <TabsTrigger value="leads" className="gap-2 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
            <Users className="w-3.5 h-3.5" /> Leads ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="conversations" className="gap-2 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
            <MessageSquare className="w-3.5 h-3.5" /> Conversas
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
            <Settings2 className="w-3.5 h-3.5" /> Configuração
          </TabsTrigger>
        </TabsList>

        {/* LEADS TAB */}
        <TabsContent value="leads" className="space-y-4 mt-4">
          {stats.stuckLeads.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl p-4 bg-amber-500/[0.04] border border-amber-500/20"
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-medium text-amber-400">
                  {stats.stuckLeads.length} lead{stats.stuckLeads.length > 1 ? 's' : ''} parado{stats.stuckLeads.length > 1 ? 's' : ''} há +48h
                </h4>
              </div>
              <div className="space-y-1.5">
                {stats.stuckLeads.map(lead => (
                  <LeadRow key={lead.id} lead={lead} meta={meta} onSelect={setSelectedLeadId} isStuck agentName={agentName} />
                ))}
              </div>
            </motion.div>
          )}

          <div className="bg-card/40 border border-white/[0.06] rounded-xl p-4">
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${meta.text}`} /> Leads ativos ({stats.activeLeads.length})
            </h4>
            {stats.activeLeads.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Nenhum lead ativo neste agente</p>
            ) : (
              <div className="space-y-1.5">
                {stats.activeLeads.map(lead => (
                  <LeadRow key={lead.id} lead={lead} meta={meta} onSelect={setSelectedLeadId} agentName={agentName} />
                ))}
              </div>
            )}
          </div>

          {agentName === 'emma' && <NpsSummary leads={leads} />}
        </TabsContent>

        {/* CONVERSATIONS TAB */}
        <TabsContent value="conversations" className="mt-4">
          <div className="flex h-[calc(100vh-22rem)] gap-4">
            <div className="w-64 flex-shrink-0 bg-card/40 border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
              <div className="p-3 border-b border-white/[0.06]">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Leads</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {leads.map(lead => (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-white/[0.03] transition-colors text-sm ${
                      selectedLeadId === lead.id ? `bg-card border-l-2 ${meta.border}` : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <p className="font-medium text-foreground truncate text-[13px]">{lead.contact_name || lead.company_name || lead.whatsapp_number || 'Anônimo'}</p>
                    <p className="text-[10px] text-muted-foreground">{STATUS_LABELS[lead.status] || lead.status}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 bg-card/40 border border-white/[0.06] rounded-xl flex flex-col overflow-hidden">
              {selectedLeadId ? (
                <>
                  <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${meta.bg}/10 flex items-center justify-center text-xs font-bold ${meta.text}`}>
                      {(leads.find(l => l.id === selectedLeadId)?.contact_name || '?')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{leads.find(l => l.id === selectedLeadId)?.contact_name || 'Lead'}</p>
                      <p className="text-[10px] text-muted-foreground">{leads.find(l => l.id === selectedLeadId)?.whatsapp_number}</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {leadMessages.map(msg => (
                      <ChatBubble key={msg.id} msg={msg} agentMeta={meta} />
                    ))}
                    {leadMessages.length === 0 && <p className="text-center text-muted-foreground text-sm py-10">Nenhuma mensagem</p>}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Selecione um lead para ver as mensagens</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* CONFIG TAB */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <div className="bg-card/40 border border-white/[0.06] rounded-xl p-6 space-y-5">
            {/* Features */}
            <div className={`rounded-xl p-4 border ${meta.border} bg-gradient-to-r ${meta.gradient}`}>
              <p className={`text-xs font-medium ${meta.text} flex items-center gap-1.5 mb-3`}>
                <Zap className="w-3.5 h-3.5" /> Funcionalidades
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {meta.features.map(feat => (
                  <div key={feat} className="bg-card/60 rounded-lg px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
                    <CheckCircle className={`w-3 h-3 ${meta.text} opacity-60`} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>

            {/* Parameters */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1.5 block font-medium">Temperature</label>
                <Input value={tempDraft} onChange={(e) => setTempDraft(e.target.value)} className="bg-card/60 border-white/10 text-sm font-mono" type="number" step="0.1" min="0" max="2" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1.5 block font-medium">Max Tokens</label>
                <Input value={tokensDraft} onChange={(e) => setTokensDraft(e.target.value)} className="bg-card/60 border-white/10 text-sm font-mono" type="number" />
              </div>
            </div>

            {/* System Prompt */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  <label className="text-[11px] text-muted-foreground font-medium">System Prompt ({promptDraft.length} chars)</label>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingPrompt(!editingPrompt)} className="text-xs h-7 px-3">
                  {editingPrompt ? 'Cancelar' : 'Editar'}
                </Button>
              </div>
              {editingPrompt ? (
                <Textarea value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} className="bg-card/60 border-white/10 text-xs font-mono min-h-[300px] leading-relaxed" />
              ) : (
                <div className="bg-card/40 border border-white/[0.06] rounded-xl p-4 max-h-64 overflow-y-auto">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{promptDraft}</pre>
                </div>
              )}
            </div>

            <Button onClick={saveConfig} disabled={savingConfig} className="bg-accent hover:bg-accent/90 text-accent-foreground px-6">
              {savingConfig ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ── Sub-components ── */

const ChatBubble = ({ msg, agentMeta }: { msg: any; agentMeta: typeof AGENT_META.claire }) => {
  const isLead = msg.role === 'user';
  const isManual = msg.metadata?.manual;
  const isFollowup = msg.metadata?.followup;

  return (
    <div className={`max-w-[75%] ${isLead ? 'mr-auto' : 'ml-auto'}`}>
      <div className={`p-3 rounded-2xl text-sm ${
        isLead
          ? 'bg-accent/8 border border-accent/15 rounded-bl-md'
          : `bg-card/80 border border-white/[0.08] rounded-br-md ${isManual ? 'border-amber-500/20' : ''}`
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-semibold ${isLead ? 'text-accent' : agentMeta.text}`}>
            {isLead ? '👤 Lead' : `${msg.agent || 'Agent'}${isManual ? ' (manual)' : ''}${isFollowup ? ' (follow-up)' : ''}`}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {new Date(msg.created_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
      </div>
    </div>
  );
};

const LeadRow = ({ lead, meta, onSelect, isStuck, agentName }: { lead: any; meta: any; onSelect: (id: string) => void; isStuck?: boolean; agentName?: string }) => {
  const hours = differenceInHours(new Date(), new Date(lead.updated_at));
  const days = differenceInDays(new Date(), new Date(lead.updated_at));
  const [confirming, setConfirming] = useState(false);

  const handleConfirmProposal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke('lucas-post-visit', {
        body: { action: 'confirm_proposal', lead_id: lead.id },
      });
      if (error) {
        toast.error('Erro ao confirmar proposta: ' + error.message);
      } else {
        toast.success('✅ Proposta confirmada — lead transferido para Claire');
      }
    } catch (e) {
      toast.error('Erro ao confirmar proposta');
    }
    setConfirming(false);
  };

  return (
    <button
      onClick={() => onSelect(lead.id)}
      className="w-full flex items-center justify-between bg-card/30 hover:bg-card/60 rounded-lg px-3 py-2.5 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full ${meta.bg}/10 flex items-center justify-center text-xs font-bold ${meta.text}`}>
          {(lead.contact_name || lead.company_name || '?')[0]?.toUpperCase()}
        </div>
        <div className="text-left">
          <p className="text-[13px] text-foreground group-hover:text-foreground">{lead.contact_name || lead.company_name || lead.whatsapp_number || 'Anônimo'}</p>
          <p className="text-[10px] text-muted-foreground">
            {STATUS_LABELS[lead.status || 'new']}{lead.company_name && lead.contact_name ? ` · ${lead.company_name}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {agentName === 'lucas' && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleConfirmProposal}
            disabled={confirming}
            className="text-[10px] h-7 px-2.5 border-amber-500/30 hover:bg-amber-500/10 text-amber-400 gap-1"
          >
            <FileCheck className="w-3 h-3" />
            {confirming ? '...' : 'Confirmar Proposta'}
          </Button>
        )}
        {isStuck ? (
          <span className="text-[11px] font-medium text-amber-400">{days}d</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">{hours < 1 ? 'agora' : `${hours}h`}</span>
        )}
        {lead.score && <Badge className={`text-[9px] border ${SCORE_COLORS[lead.score] || ''}`}>{lead.score}</Badge>}
        <Eye className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
      </div>
    </button>
  );
};

const NpsSummary = ({ leads }: { leads: any[] }) => {
  const withNps = leads.filter(l => l.nps_data?.last_nps_score != null);
  const promoters = withNps.filter(l => l.nps_data.last_nps_score >= 9).length;
  const passives = withNps.filter(l => l.nps_data.last_nps_score >= 7 && l.nps_data.last_nps_score < 9).length;
  const detractors = withNps.filter(l => l.nps_data.last_nps_score < 7).length;

  if (withNps.length === 0) return null;

  return (
    <div className="bg-card/40 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-emerald-400" />
        <h4 className="text-sm font-medium text-foreground">NPS Resumo</h4>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Promotores (9-10)', value: promoters, color: 'emerald' },
          { label: 'Passivos (7-8)', value: passives, color: 'amber' },
          { label: 'Detratores (0-6)', value: detractors, color: 'red' },
        ].map(item => (
          <div key={item.label} className={`bg-${item.color}-500/5 border border-${item.color}-500/15 rounded-xl p-3 text-center`}>
            <p className={`text-xl font-mono font-bold text-${item.color}-400`}>{item.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentDetail;
