import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Send, MessageSquare, PanelRightOpen, PanelRightClose, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LeadInfoCard } from '@/components/dashboard/LeadInfoCard';

const AGENT_META: Record<string, { emoji: string; text: string; bg: string }> = {
  sophie: { emoji: '🔍', text: 'text-violet-400', bg: 'bg-violet-500' },
  claire: { emoji: '📋', text: 'text-blue-400', bg: 'bg-blue-500' },
  lucas: { emoji: '📄', text: 'text-amber-400', bg: 'bg-amber-500' },
  emma: { emoji: '⭐', text: 'text-emerald-400', bg: 'bg-emerald-500' },
};

const Conversations = () => {
  const { t } = useTranslation();
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showCard, setShowCard] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchLeads = async () => {
    const { data } = await supabase.from('leads').select('id, contact_name, company_name, whatsapp_number, active_agent, status').order('updated_at', { ascending: false });
    if (data) setLeads(data);
  };

  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel('leads-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!selectedLeadId) return;
    const fetchMessages = async () => {
      const { data } = await supabase.from('conversations').select('*').eq('lead_id', selectedLeadId).order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();
    const channel = supabase
      .channel(`conv-${selectedLeadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `lead_id=eq.${selectedLeadId}` }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedLeadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendManualMessage = async () => {
    if (!newMessage.trim() || !selectedLeadId) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ lead_id: selectedLeadId, message: newMessage }),
      });
      const result = await resp.json();
      if (result.error) {
        toast.error(`Error: ${result.error}`);
      } else {
        setNewMessage('');
        toast.success(result.whatsapp_sent ? t('dashboard.conversations.msg_sent_whatsapp') : t('dashboard.conversations.msg_saved'));
      }
    } catch {
      toast.error(t('dashboard.conversations.send_error'));
    }
    setSending(false);
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      (lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lead.whatsapp_number?.includes(searchQuery));
    const matchesAgent = !agentFilter || lead.active_agent === agentFilter;
    return matchesSearch && matchesAgent;
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-3">
      {/* Contacts sidebar */}
      <div className="w-72 flex-shrink-0 bg-card/40 border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
        {/* Search & Filter */}
        <div className="p-3 border-b border-white/[0.06] space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <Input
              placeholder={t('dashboard.conversations.contacts')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 bg-card/60 border-white/[0.06] text-xs"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setAgentFilter(null)}
              className={`text-[10px] px-2 py-1 rounded-full transition-colors ${!agentFilter ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Todos
            </button>
            {Object.entries(AGENT_META).map(([name, meta]) => (
              <button
                key={name}
                onClick={() => setAgentFilter(agentFilter === name ? null : name)}
                className={`text-[10px] px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                  agentFilter === name ? `${meta.bg}/15 ${meta.text}` : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{meta.emoji}</span>
                <span className="capitalize">{name[0].toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {filteredLeads.map((lead) => {
            const agentMeta = AGENT_META[lead.active_agent] || { emoji: '🤖', text: 'text-muted-foreground', bg: 'bg-muted' };
            return (
              <button
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                className={`w-full text-left px-3 py-3 border-b border-white/[0.03] transition-all ${
                  selectedLeadId === lead.id ? 'bg-accent/8 border-l-2 border-l-accent' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full ${agentMeta.bg}/10 flex items-center justify-center text-[11px] font-bold ${agentMeta.text}`}>
                    {(lead.contact_name || lead.whatsapp_number || '?')[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium text-foreground truncate flex-1">
                        {lead.contact_name || lead.whatsapp_number || t('dashboard.conversations.anonymous_lead')}
                      </p>
                      <span className="text-[10px]">{agentMeta.emoji}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{lead.company_name || lead.status || ''}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {filteredLeads.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">{t('dashboard.conversations.no_contact')}</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-card/40 border border-white/[0.06] rounded-xl flex flex-col overflow-hidden">
        {selectedLeadId ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${AGENT_META[selectedLead?.active_agent]?.bg || 'bg-muted'}/10 flex items-center justify-center`}>
                  <MessageSquare className={`w-4 h-4 ${AGENT_META[selectedLead?.active_agent]?.text || 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedLead?.contact_name || 'Lead'}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${AGENT_META[selectedLead?.active_agent]?.text || 'text-muted-foreground'}`}>
                      {AGENT_META[selectedLead?.active_agent]?.emoji} {selectedLead?.active_agent}
                    </span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{selectedLead?.whatsapp_number || t('dashboard.conversations.no_number')}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowCard(!showCard)} className="text-muted-foreground hover:text-foreground h-8 w-8">
                {showCard ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isLead = msg.role === 'user';
                const agentMeta = AGENT_META[msg.agent] || { emoji: '🤖', text: 'text-muted-foreground', bg: 'bg-muted' };
                const isManual = msg.metadata?.manual;
                const isFollowup = msg.metadata?.followup;

                return (
                  <div key={msg.id} className={`max-w-[75%] ${isLead ? 'mr-auto' : 'ml-auto'}`}>
                    <div className={`p-3 rounded-2xl text-sm ${
                      isLead
                        ? 'bg-accent/8 border border-accent/15 rounded-bl-md'
                        : `bg-card/80 border border-white/[0.08] rounded-br-md ${isManual ? 'border-amber-500/20' : ''}`
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold ${isLead ? 'text-accent' : agentMeta.text}`}>
                          {isLead ? '👤 Lead' : `${agentMeta.emoji} ${msg.agent}${isManual ? ` (${t('dashboard.conversations.manual')})` : ''}${isFollowup ? ` (${t('dashboard.conversations.followup')})` : ''}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {new Date(msg.created_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/[0.06] flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t('dashboard.conversations.send_placeholder')}
                className="h-10 bg-card/60 border-white/[0.06] text-sm"
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendManualMessage()}
              />
              <Button onClick={sendManualMessage} disabled={sending} size="icon" className="h-10 w-10 bg-accent hover:bg-accent/90 text-accent-foreground flex-shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-2xl bg-card/60 border border-white/[0.06] flex items-center justify-center">
              <MessageSquare className="w-7 h-7 opacity-30" />
            </div>
            <p className="text-sm">{t('dashboard.conversations.select_contact')}</p>
          </div>
        )}
      </div>

      {/* Client info card */}
      {selectedLeadId && showCard && (
        <div className="w-80 flex-shrink-0 bg-card/40 border border-white/[0.06] rounded-xl overflow-hidden">
          <LeadInfoCard leadId={selectedLeadId} />
        </div>
      )}
    </div>
  );
};

export default Conversations;
