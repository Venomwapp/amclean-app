import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Plus, Euro, FileText, Clock, CheckCircle2, Send, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

const Billing = () => {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [form, setForm] = useState({
    lead_id: '', client_site_id: '', invoice_number: '', amount: '',
    tax_rate: '21', description: '', due_date: '', period_start: '', period_end: '',
  });

  const fetchAll = async () => {
    const [inv, ld, st] = await Promise.all([
      supabase.from('invoices').select('*, leads(contact_name, company_name), client_sites(name)').order('created_at', { ascending: false }),
      supabase.from('leads').select('id, contact_name, company_name').order('contact_name'),
      supabase.from('client_sites').select('id, name').eq('is_active', true).order('name'),
    ]);
    if (inv.data) setInvoices(inv.data);
    if (ld.data) setLeads(ld.data);
    if (st.data) setSites(st.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const createInvoice = async () => {
    if (!form.invoice_number || !form.amount) return toast.error(t('dashboard.billing.number_amount_required'));
    const { error } = await supabase.from('invoices').insert({
      invoice_number: form.invoice_number, amount: parseFloat(form.amount), tax_rate: parseFloat(form.tax_rate),
      lead_id: form.lead_id || null, client_site_id: form.client_site_id || null, description: form.description || null,
      due_date: form.due_date || null, period_start: form.period_start || null, period_end: form.period_end || null, status: 'draft',
    });
    if (error) toast.error('Error: ' + error.message);
    else {
      toast.success(t('dashboard.billing.invoice_created'));
      setShowCreate(false);
      setForm({ lead_id: '', client_site_id: '', invoice_number: '', amount: '', tax_rate: '21', description: '', due_date: '', period_start: '', period_end: '' });
      fetchAll();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'paid') updates.paid_date = new Date().toISOString().split('T')[0];
    await supabase.from('invoices').update(updates).eq('id', id);
    toast.success(t('dashboard.billing.status_updated'));
    fetchAll();
    if (selectedInvoice?.id === id) setSelectedInvoice({ ...selectedInvoice, ...updates });
  };

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0);
  const totalPending = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.total || 0), 0);
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.total || 0), 0);
  const totalDraft = invoices.filter(i => i.status === 'draft').length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-white/5 text-muted-foreground border-white/10',
      sent: 'bg-accent/20 text-accent border-accent/30',
      paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
      cancelled: 'bg-muted text-muted-foreground border-white/10',
    };
    return map[status] || map.draft;
  };

  const statusLabel: Record<string, string> = {
    draft: t('dashboard.billing.draft'), sent: t('dashboard.billing.sent'), paid: t('dashboard.billing.paid'),
    overdue: t('dashboard.billing.overdue'), cancelled: t('dashboard.billing.cancelled'),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-xs text-muted-foreground">{t('dashboard.billing.paid_total')}</span></div>
          <p className="text-xl font-display font-bold text-foreground">€{totalRevenue.toLocaleString('fr-BE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 text-accent" /><span className="text-xs text-muted-foreground">{t('dashboard.billing.pending')}</span></div>
          <p className="text-xl font-display font-bold text-foreground">€{totalPending.toLocaleString('fr-BE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-red-400" /><span className="text-xs text-muted-foreground">{t('dashboard.billing.overdue')}</span></div>
          <p className="text-xl font-display font-bold text-foreground text-red-400">€{totalOverdue.toLocaleString('fr-BE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">{t('dashboard.billing.drafts')}</span></div>
          <p className="text-xl font-display font-bold text-foreground">{totalDraft}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px] h-11 bg-card/50 border-white/10"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-white/10">
            <SelectItem value="all">{t('dashboard.billing.all')}</SelectItem>
            <SelectItem value="draft">{t('dashboard.billing.draft')}</SelectItem>
            <SelectItem value="sent">{t('dashboard.billing.sent')}</SelectItem>
            <SelectItem value="paid">{t('dashboard.billing.paid')}</SelectItem>
            <SelectItem value="overdue">{t('dashboard.billing.overdue')}</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="w-4 h-4 mr-2" /> {t('dashboard.billing.new_invoice')}</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 max-w-lg">
            <DialogHeader><DialogTitle className="text-foreground">{t('dashboard.billing.create_invoice')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.billing.invoice_number')} *</label>
                  <Input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} placeholder="FAC-2026-001" className="bg-background/50 border-white/10" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.billing.amount_ht')} *</label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="bg-background/50 border-white/10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.billing.vat')}</label>
                  <Input type="number" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} className="bg-background/50 border-white/10" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.billing.due_date')}</label>
                  <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="bg-background/50 border-white/10" />
                </div>
              </div>
              <Select value={form.lead_id} onValueChange={v => setForm({ ...form, lead_id: v })}>
                <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder={t('dashboard.billing.client_lead')} /></SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.contact_name || l.company_name || 'Lead'}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.client_site_id} onValueChange={v => setForm({ ...form, client_site_id: v })}>
                <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder={t('dashboard.billing.client_site_optional')} /></SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.billing.period_start')}</label>
                  <Input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} className="bg-background/50 border-white/10" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.billing.period_end')}</label>
                  <Input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} className="bg-background/50 border-white/10" />
                </div>
              </div>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('dashboard.billing.description')} className="bg-background/50 border-white/10" rows={2} />
              <Button onClick={createInvoice} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">{t('dashboard.billing.create')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.billing.invoice_number')}</th>
                <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider hidden md:table-cell">{t('dashboard.billing.client')}</th>
                <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.billing.amount_ttc')}</th>
                <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider hidden lg:table-cell">{t('dashboard.billing.due_date')}</th>
                <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.billing.status')}</th>
                <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 uppercase tracking-wider">{t('dashboard.leads.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">{t('dashboard.billing.no_invoices')}</td></tr>
              ) : (
                filtered.map(inv => (
                  <tr key={inv.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{inv.invoice_number}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">{inv.leads?.contact_name || inv.leads?.company_name || inv.client_sites?.name || '—'}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-foreground">€{Number(inv.total || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('fr-BE') : '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusBadge(inv.status)}`}>{statusLabel[inv.status] || inv.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {inv.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => updateStatus(inv.id, 'sent')} className="text-xs text-accent hover:text-accent" title={t('dashboard.billing.mark_sent')}><Send className="w-3 h-3" /></Button>}
                        {(inv.status === 'sent' || inv.status === 'overdue') && <Button size="sm" variant="ghost" onClick={() => updateStatus(inv.id, 'paid')} className="text-xs text-emerald-400 hover:text-emerald-400" title={t('dashboard.billing.mark_paid')}><CheckCircle2 className="w-3 h-3" /></Button>}
                        {inv.status !== 'cancelled' && inv.status !== 'paid' && <Button size="sm" variant="ghost" onClick={() => updateStatus(inv.id, 'cancelled')} className="text-xs text-muted-foreground hover:text-destructive" title={t('dashboard.billing.cancel')}><X className="w-3 h-3" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Billing;
