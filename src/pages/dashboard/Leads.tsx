import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Search, Eye, UserCog, LayoutGrid, List, StickyNote, Send, Zap, Trash2 } from 'lucide-react';
import { ProspectingModal } from '@/components/dashboard/ProspectingModal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const Leads = () => {
  const { t } = useTranslation();

  const STATUS_COLUMNS = [
    { key: 'new', label: t('dashboard.leads.new'), color: 'border-blue-500/40 bg-blue-500/5' },
    { key: 'qualifying', label: t('dashboard.leads.qualifying'), color: 'border-amber-500/40 bg-amber-500/5' },
    { key: 'scheduled', label: t('dashboard.leads.scheduled'), color: 'border-purple-500/40 bg-purple-500/5' },
    { key: 'converted', label: t('dashboard.leads.converted'), color: 'border-emerald-500/40 bg-emerald-500/5' },
    { key: 'lost', label: t('dashboard.leads.lost'), color: 'border-red-500/40 bg-red-500/5' },
  ];

  const [leads, setLeads] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban');
  const [noteText, setNoteText] = useState('');
  const [prospectingOpen, setProspectingOpen] = useState(false);

  const fetchLeads = async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (data) { setLeads(data); setFiltered(data); }
  };

  useEffect(() => { fetchLeads(); }, []);

  useEffect(() => {
    let result = leads;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        (l.contact_name || '').toLowerCase().includes(s) ||
        (l.company_name || '').toLowerCase().includes(s) ||
        (l.email || '').toLowerCase().includes(s) ||
        (l.phone || '').toLowerCase().includes(s)
      );
    }
    if (scoreFilter !== 'all') result = result.filter(l => l.score === scoreFilter);
    if (statusFilter !== 'all') result = result.filter(l => l.status === statusFilter);
    setFiltered(result);
  }, [search, scoreFilter, statusFilter, leads]);

  const openLead = async (lead: any) => {
    setSelectedLead(lead);
    setNoteText(lead.notes || '');
    const { data } = await supabase.from('conversations').select('*').eq('lead_id', lead.id).order('created_at', { ascending: true });
    if (data) setConversations(data);
  };

  const changeAgent = async (leadId: string, agent: "claire" | "sophie" | "lucas" | "emma") => {
    await supabase.from('leads').update({ active_agent: agent }).eq('id', leadId);
    toast.success(`Agent → ${agent}`);
    fetchLeads();
    if (selectedLead?.id === leadId) setSelectedLead({ ...selectedLead, active_agent: agent });
  };

  const changeStatus = async (leadId: string, status: "new" | "qualifying" | "scheduled" | "followup_1" | "followup_2" | "followup_3" | "converted" | "lost") => {
    await supabase.from('leads').update({ status }).eq('id', leadId);
    toast.success(t('dashboard.billing.status_updated'));
    fetchLeads();
    if (selectedLead?.id === leadId) setSelectedLead({ ...selectedLead, status });

    // When lead is converted, trigger Emma onboarding automatically
    if (status === 'converted') {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        await fetch(`https://${projectId}.supabase.co/functions/v1/emma-onboarding`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lead_id: leadId }),
        });
        toast.success('🤖 Emma enviou mensagem de boas-vindas!');
      } catch (err) {
        console.error('Emma onboarding error:', err);
      }
    }
  };

  const saveNotes = async () => {
    if (!selectedLead) return;
    await supabase.from('leads').update({ notes: noteText }).eq('id', selectedLead.id);
    toast.success('✓');
    setSelectedLead({ ...selectedLead, notes: noteText });
    fetchLeads();
  };

  const deleteLead = async (leadId: string) => {
    // Delete related records first
    await supabase.from('conversations').delete().eq('lead_id', leadId);
    await supabase.from('followups').delete().eq('lead_id', leadId);
    await supabase.from('appointments').delete().eq('lead_id', leadId);
    await supabase.from('leads').delete().eq('id', leadId);
    toast.success('Lead supprimé');
    if (selectedLead?.id === leadId) setSelectedLead(null);
    fetchLeads();
  };

  const deleteAllLeads = async () => {
    await supabase.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('followups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('appointments').delete().neq('lead_id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    toast.success('Tous les leads supprimés');
    setSelectedLead(null);
    fetchLeads();
  };

  const scoreColor = (score: string | null) => {
    if (score === 'HOT') return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score === 'WARM') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (score === 'COLD') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-white/5 text-muted-foreground border-white/10';
  };

  const KanbanCard = ({ lead }: { lead: any }) => (
    <div onClick={() => openLead(lead)} className="p-3 rounded-lg bg-card/60 border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground truncate">{lead.contact_name || lead.company_name || lead.whatsapp_number || t('dashboard.leads.no_name')}</p>
        {lead.score && <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${scoreColor(lead.score)}`}>{lead.score}</span>}
      </div>
      {lead.company_name && <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>}
      {lead.service_requested && <p className="text-xs text-muted-foreground/70 truncate">{lead.service_requested}</p>}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground capitalize">{lead.active_agent || 'claire'}</span>
        {lead.notes && <StickyNote className="w-3 h-3 text-amber-400/60" />}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('dashboard.leads.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11 bg-card/50 border-white/10" />
        </div>
        <Select value={scoreFilter} onValueChange={setScoreFilter}>
          <SelectTrigger className="w-[140px] h-11 bg-card/50 border-white/10"><SelectValue placeholder={t('dashboard.leads.score')} /></SelectTrigger>
          <SelectContent className="bg-card border-white/10">
            <SelectItem value="all">{t('dashboard.leads.all_scores')}</SelectItem>
            <SelectItem value="HOT">🔥 HOT</SelectItem>
            <SelectItem value="WARM">🌤 WARM</SelectItem>
            <SelectItem value="COLD">❄️ COLD</SelectItem>
          </SelectContent>
        </Select>
        {viewMode === 'table' && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-11 bg-card/50 border-white/10"><SelectValue placeholder={t('dashboard.leads.status')} /></SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              <SelectItem value="all">{t('dashboard.leads.all_status')}</SelectItem>
              <SelectItem value="new">{t('dashboard.leads.new')}</SelectItem>
              <SelectItem value="qualifying">{t('dashboard.leads.qualifying')}</SelectItem>
              <SelectItem value="scheduled">{t('dashboard.leads.scheduled')}</SelectItem>
              <SelectItem value="converted">{t('dashboard.leads.converted')}</SelectItem>
              <SelectItem value="lost">{t('dashboard.leads.lost')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setProspectingOpen(true)}
            className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/20 h-11 gap-2"
            variant="outline"
          >
            <Zap className="w-4 h-4" />
            Prospectar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 h-11 gap-2">
                <Trash2 className="w-4 h-4" />
                Supprimer tout
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer tous les leads ?</AlertDialogTitle>
                <AlertDialogDescription>Cette action est irréversible. Tous les leads et leurs conversations seront supprimés.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-white/10">Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAllLeads} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('kanban')} className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'kanban' ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
              <LayoutGrid className="w-4 h-4" /> {t('dashboard.leads.kanban')}
            </button>
            <button onClick={() => setViewMode('table')} className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'table' ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
              <List className="w-4 h-4" /> {t('dashboard.leads.list')}
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map(col => {
            const colLeads = filtered.filter(l => (l.status || 'new') === col.key);
            return (
              <div key={col.key} className={`flex-shrink-0 w-[260px] rounded-xl border ${col.color} p-3 space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{col.label}</h3>
                  <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">{colLeads.length}</span>
                </div>
                <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {colLeads.map(lead => <KanbanCard key={lead.id} lead={lead} />)}
                  {colLeads.length === 0 && <p className="text-xs text-muted-foreground/50 text-center py-6">{t('dashboard.leads.no_lead')}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.leads.contact')}</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider hidden md:table-cell">{t('dashboard.leads.company')}</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider hidden lg:table-cell">{t('dashboard.leads.service')}</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.leads.score')}</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.leads.status')}</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider hidden md:table-cell">{t('dashboard.leads.agent')}</th>
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.leads.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">{t('dashboard.leads.no_leads')}</td></tr>
                ) : (
                  filtered.map((lead) => (
                    <tr key={lead.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3"><div><p className="text-sm font-medium text-foreground">{lead.contact_name || '—'}</p><p className="text-xs text-muted-foreground">{lead.email || lead.phone || lead.whatsapp_number || '—'}</p></div></td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">{lead.company_name || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{lead.service_requested || '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${scoreColor(lead.score)}`}>{lead.score || '—'}</span></td>
                      <td className="px-4 py-3"><span className="text-xs text-muted-foreground capitalize">{lead.status?.replace('_', ' ') || 'new'}</span></td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground capitalize">{lead.active_agent || '—'}</td>
                      <td className="px-4 py-3 flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openLead(lead)} className="text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteLead(lead.id)} className="text-red-400/60 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-foreground">
                {selectedLead?.contact_name || 'Lead'} {selectedLead?.company_name ? `— ${selectedLead.company_name}` : ''}
              </DialogTitle>
              {selectedLead && (
                <Button variant="ghost" size="icon" onClick={() => deleteLead(selectedLead.id)} className="text-red-400/60 hover:text-red-400 -mr-2">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  [t('dashboard.leads.email'), selectedLead.email],
                  [t('dashboard.leads.phone'), selectedLead.phone || selectedLead.whatsapp_number],
                  [t('dashboard.leads.service'), selectedLead.service_requested],
                  [t('dashboard.leads.location'), selectedLead.location],
                  [t('dashboard.leads.surface'), selectedLead.surface_area],
                  [t('dashboard.leads.frequency'), selectedLead.frequency],
                  [t('dashboard.leads.source'), selectedLead.source],
                  [t('dashboard.leads.language'), selectedLead.language],
                ].map(([label, value]) => (
                  <div key={label as string} className="p-2 rounded-lg bg-background/50">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <p className="text-foreground">{(value as string) || '—'}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t('dashboard.leads.status')} :</span>
                  <Select value={selectedLead.status || 'new'} onValueChange={(v) => changeStatus(selectedLead.id, v as any)}>
                    <SelectTrigger className="w-[150px] h-9 bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      {STATUS_COLUMNS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      <SelectItem value="followup_1">{t('dashboard.leads.followup_1')}</SelectItem>
                      <SelectItem value="followup_2">{t('dashboard.leads.followup_2')}</SelectItem>
                      <SelectItem value="followup_3">{t('dashboard.leads.followup_3')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <UserCog className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('dashboard.leads.agent')} :</span>
                  <Select value={selectedLead.active_agent || 'claire'} onValueChange={(v) => changeAgent(selectedLead.id, v as any)}>
                    <SelectTrigger className="w-[130px] h-9 bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      <SelectItem value="claire">Claire</SelectItem>
                      <SelectItem value="sophie">Sophie</SelectItem>
                      <SelectItem value="lucas">Lucas</SelectItem>
                      <SelectItem value="emma">Emma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-medium text-foreground">{t('dashboard.leads.internal_notes')}</h4>
                </div>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t('dashboard.leads.notes_placeholder')} className="bg-background/50 border-white/10 min-h-[80px] text-sm" />
                <Button size="sm" variant="outline" onClick={saveNotes} className="border-white/10 text-xs">
                  <Send className="w-3 h-3 mr-1.5" /> {t('dashboard.leads.save')}
                </Button>
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">{t('dashboard.leads.conversation_history')}</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {conversations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('dashboard.leads.no_conversation')}</p>
                  ) : (
                    conversations.map((msg) => (
                      <div key={msg.id} className={`p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-accent/10 border border-accent/20 ml-0 mr-8' : 'bg-white/[0.04] border border-white/[0.06] ml-8 mr-0'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-foreground">{msg.role === 'user' ? 'Lead' : `Agent ${msg.agent}`}</span>
                          <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleString('fr-BE')}</span>
                        </div>
                        <p className="text-muted-foreground">{msg.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ProspectingModal
        open={prospectingOpen}
        onOpenChange={setProspectingOpen}
        onComplete={fetchLeads}
      />
    </div>
  );
};

export default Leads;
