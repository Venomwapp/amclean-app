import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  User, Building2, Phone, Mail, MapPin, Ruler, Clock, CalendarDays,
  ArrowRightLeft, Tag, Globe, Briefcase, RefreshCw, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  new: 'Novo', qualifying: 'Qualificando', scheduled: 'Agendado',
  followup_1: 'Follow-up 1', followup_2: 'Follow-up 2', followup_3: 'Follow-up 3',
  converted: 'Convertido', lost: 'Perdido',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  qualifying: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  scheduled: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  followup_1: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  followup_2: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  followup_3: 'bg-red-500/15 text-red-400 border-red-500/20',
  converted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  lost: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const SCORE_COLORS: Record<string, string> = {
  HOT: 'bg-red-500/15 text-red-400 border-red-500/20',
  WARM: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  COLD: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
};

const AGENT_META: Record<string, { name: string; emoji: string; text: string }> = {
  sophie: { name: 'Sophie', emoji: '🔍', text: 'text-violet-400' },
  claire: { name: 'Claire', emoji: '📋', text: 'text-blue-400' },
  lucas: { name: 'Lucas', emoji: '📄', text: 'text-amber-400' },
  emma: { name: 'Emma', emoji: '⭐', text: 'text-emerald-400' },
};

interface LeadInfoCardProps {
  leadId: string;
}

export const LeadInfoCard = ({ leadId }: LeadInfoCardProps) => {
  const [lead, setLead] = useState<any>(null);
  const [agentHistory, setAgentHistory] = useState<{ agent: string; at: string }[]>([]);
  const [transferAgent, setTransferAgent] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    fetchLead();
    fetchAgentHistory();
  }, [leadId]);

  const fetchLead = async () => {
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (data) setLead(data);
  };

  const fetchAgentHistory = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('agent, created_at')
      .eq('lead_id', leadId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: true });

    if (data && data.length > 0) {
      const history: { agent: string; at: string }[] = [];
      let lastAgent = '';
      for (const msg of data) {
        if (msg.agent && msg.agent !== lastAgent) {
          history.push({ agent: msg.agent, at: msg.created_at });
          lastAgent = msg.agent;
        }
      }
      setAgentHistory(history);
    }
  };

  const handleTransfer = async () => {
    if (!transferAgent || !lead) return;
    setTransferring(true);
    const { error } = await supabase.from('leads').update({
      active_agent: transferAgent as any,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success(`Lead transferido para ${AGENT_META[transferAgent]?.name}`); fetchLead(); }
    setTransferring(false);
    setTransferAgent('');
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return;
    const { error } = await supabase.from('leads').update({
      status: newStatus as any,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Status atualizado'); fetchLead(); }
  };

  if (!lead) return <div className="p-4 text-sm text-muted-foreground">Carregando...</div>;

  const agentInfo = AGENT_META[lead.active_agent] || { name: lead.active_agent, emoji: '🤖', text: 'text-muted-foreground' };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-sm font-bold text-accent">
            {(lead.contact_name || lead.company_name || '?')[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{lead.contact_name || lead.whatsapp_number || 'Sem nome'}</p>
            {lead.company_name && <p className="text-[11px] text-muted-foreground truncate">{lead.company_name}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge className={`text-[10px] border ${STATUS_COLORS[lead.status] || 'bg-muted text-muted-foreground'}`}>
            {STATUS_LABELS[lead.status] || lead.status}
          </Badge>
          {lead.score && <Badge className={`text-[10px] border ${SCORE_COLORS[lead.score]}`}>{lead.score}</Badge>}
          <Badge className={`text-[10px] bg-card/60 border border-white/[0.06] ${agentInfo.text}`}>
            {agentInfo.emoji} {agentInfo.name}
          </Badge>
        </div>
      </div>

      {/* Contact */}
      <InfoSection title="Contacto" icon={<User className="w-3 h-3" />}>
        <InfoRow icon={Phone} label="WhatsApp" value={lead.whatsapp_number} />
        <InfoRow icon={Mail} label="Email" value={lead.email} />
        <InfoRow icon={Globe} label="Idioma" value={lead.language?.toUpperCase()} />
        <InfoRow icon={Tag} label="Fonte" value={lead.source} />
      </InfoSection>

      {/* Qualification */}
      <InfoSection title="Qualificação" icon={<Sparkles className="w-3 h-3" />}>
        <InfoRow icon={Briefcase} label="Serviço" value={lead.service_requested} />
        <InfoRow icon={Building2} label="Espaço" value={lead.space_type} />
        <InfoRow icon={Ruler} label="Superfície" value={lead.surface_area} />
        <InfoRow icon={RefreshCw} label="Frequência" value={lead.frequency} />
        <InfoRow icon={MapPin} label="Localização" value={lead.location || lead.address} />
        <InfoRow icon={Clock} label="Timeline" value={lead.timeline} />
      </InfoSection>

      {/* Agent History */}
      {agentHistory.length > 0 && (
        <InfoSection title="Histórico de agentes" icon={<ArrowRightLeft className="w-3 h-3" />}>
          <div className="flex items-center gap-1 flex-wrap">
            {agentHistory.map((h, i) => {
              const info = AGENT_META[h.agent] || { name: h.agent, emoji: '🤖', text: 'text-muted-foreground' };
              return (
                <div key={i} className="flex items-center gap-1">
                  <span className={`text-[10px] ${info.text} bg-card/60 border border-white/[0.06] rounded-full px-2 py-0.5`}>
                    {info.emoji} {info.name}
                  </span>
                  {i < agentHistory.length - 1 && <span className="text-[10px] text-muted-foreground/30">→</span>}
                </div>
              );
            })}
          </div>
        </InfoSection>
      )}

      {/* Quick Actions */}
      <InfoSection title="Ações rápidas" icon={<Sparkles className="w-3 h-3" />}>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Alterar status</label>
            <Select value={lead.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-8 bg-card/60 border-white/[0.06] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Transferir agente</label>
            <div className="flex gap-1.5">
              <Select value={transferAgent} onValueChange={setTransferAgent}>
                <SelectTrigger className="h-8 bg-card/60 border-white/[0.06] text-xs flex-1">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {Object.entries(AGENT_META).filter(([k]) => k !== lead.active_agent).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">{v.emoji} {v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleTransfer}
                disabled={!transferAgent || transferring}
                className="h-8 bg-accent hover:bg-accent/90 text-accent-foreground text-xs px-3"
              >
                <ArrowRightLeft className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </InfoSection>

      {/* Timestamps */}
      <div className="pt-2 border-t border-white/[0.06] space-y-1">
        <p className="text-[10px] text-muted-foreground">Criado: {new Date(lead.created_at).toLocaleDateString('pt-BR')}</p>
        <p className="text-[10px] text-muted-foreground">Atualizado: {new Date(lead.updated_at).toLocaleDateString('pt-BR')} {new Date(lead.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>
  );
};

/* ── Sub-components ── */

const InfoSection = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-card/30 border border-white/[0.04] rounded-xl p-3">
    <div className="flex items-center gap-1.5 mb-2.5">
      <span className="text-muted-foreground/50">{icon}</span>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">{title}</p>
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-[10px] text-muted-foreground w-16 flex-shrink-0">{label}</span>
      <span className="text-[11px] text-foreground truncate">{value}</span>
    </div>
  );
};
