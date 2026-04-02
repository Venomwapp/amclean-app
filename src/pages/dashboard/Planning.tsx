import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Users, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format, startOfWeek, addDays, addWeeks, addMonths, startOfMonth, endOfMonth, endOfWeek, isSameDay, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

const DAYS_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 6);
type ViewMode = 'week' | 'day' | 'month' | 'timeline';

const Planning = () => {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [newEmployee, setNewEmployee] = useState({ name: '', phone: '', role: 'cleaner' });
  const [newSite, setNewSite] = useState({ name: '', address: '', city: '' });
  const [newEntry, setNewEntry] = useState({ employee_id: '', client_site_id: '', day_of_week: '1', start_time: '08:00', end_time: '16:00' });
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchAll = async () => {
    const [e, s, en] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('client_sites').select('*').eq('is_active', true).order('name'),
      supabase.from('schedule_entries').select('*, employees(name, color), client_sites(name, address)').eq('status', 'active').order('day_of_week'),
    ]);
    if (e.data) setEmployees(e.data);
    if (s.data) setSites(s.data);
    if (en.data) setEntries(en.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const addEmployee = async () => {
    if (!newEmployee.name.trim()) return;
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548'];
    await supabase.from('employees').insert({ ...newEmployee, color: colors[employees.length % colors.length] });
    toast.success('✓');
    setNewEmployee({ name: '', phone: '', role: 'cleaner' });
    setShowAddEmployee(false);
    fetchAll();
  };

  const addSite = async () => {
    if (!newSite.name.trim() || !newSite.address.trim()) return;
    await supabase.from('client_sites').insert(newSite);
    toast.success('✓');
    setNewSite({ name: '', address: '', city: '' });
    setShowAddSite(false);
    fetchAll();
  };

  const addEntry = async () => {
    if (!newEntry.employee_id || !newEntry.client_site_id) return;
    await supabase.from('schedule_entries').insert({ ...newEntry, day_of_week: parseInt(newEntry.day_of_week) });
    toast.success('✓');
    setShowAddEntry(false);
    fetchAll();
  };

  const deleteEntry = async (id: string) => {
    await supabase.from('schedule_entries').update({ status: 'cancelled' }).eq('id', id);
    toast.success('✓');
    fetchAll();
  };

  const navigatePrev = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, -1));
    else if (viewMode === 'week' || viewMode === 'timeline') setCurrentDate(addWeeks(currentDate, -1));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const navigateNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week' || viewMode === 'timeline') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 6 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const days: Date[] = []; let d = start;
    while (d <= end) { days.push(d); d = addDays(d, 1); }
    return days;
  }, [currentDate]);

  const currentDayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();

  const headerLabel = () => {
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy', { locale: fr });
    if (viewMode === 'week' || viewMode === 'timeline') return `${format(weekDays[0], 'd MMM', { locale: fr })} — ${format(weekDays[5], 'd MMM yyyy', { locale: fr })}`;
    return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
  };

  const EntryCard = ({ entry, compact = false }: { entry: any; compact?: boolean }) => (
    <div className={`rounded-lg ${compact ? 'p-1.5 text-[10px]' : 'p-2 text-xs'} border border-white/10 group relative`} style={{ backgroundColor: `${entry.employees?.color || '#2196F3'}20`, borderColor: `${entry.employees?.color || '#2196F3'}40` }}>
      <p className="font-medium text-foreground truncate">{entry.employees?.name}</p>
      <p className="text-muted-foreground truncate">{entry.client_sites?.name}</p>
      {!compact && <p className="text-muted-foreground">{entry.start_time?.slice(0, 5)} — {entry.end_time?.slice(0, 5)}</p>}
      <button onClick={() => deleteEntry(entry.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20"><Trash2 className="w-3 h-3 text-red-400" /></button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="border-white/10 text-foreground hover:bg-white/[0.04]"><Plus className="w-3 h-3 mr-1.5" /> {t('dashboard.planning.employee')}</Button></DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader><DialogTitle>{t('dashboard.planning.add_employee')}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder={t('dashboard.planning.name')} value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} className="bg-background/50 border-white/10" />
                <Input placeholder={t('dashboard.planning.phone')} value={newEmployee.phone} onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })} className="bg-background/50 border-white/10" />
                <Button onClick={addEmployee} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">{t('dashboard.planning.add')}</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddSite} onOpenChange={setShowAddSite}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="border-white/10 text-foreground hover:bg-white/[0.04]"><Plus className="w-3 h-3 mr-1.5" /> {t('dashboard.planning.client_site')}</Button></DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader><DialogTitle>{t('dashboard.planning.add_site')}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder={t('dashboard.planning.client_name')} value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} className="bg-background/50 border-white/10" />
                <Input placeholder={t('dashboard.planning.address')} value={newSite.address} onChange={(e) => setNewSite({ ...newSite, address: e.target.value })} className="bg-background/50 border-white/10" />
                <Input placeholder={t('dashboard.planning.city')} value={newSite.city} onChange={(e) => setNewSite({ ...newSite, city: e.target.value })} className="bg-background/50 border-white/10" />
                <Button onClick={addSite} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">{t('dashboard.planning.add')}</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddEntry} onOpenChange={setShowAddEntry}>
            <DialogTrigger asChild><Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="w-3 h-3 mr-1.5" /> {t('dashboard.planning.schedule')}</Button></DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader><DialogTitle>{t('dashboard.planning.new_entry')}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={newEntry.employee_id} onValueChange={(v) => setNewEntry({ ...newEntry, employee_id: v })}>
                  <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder={t('dashboard.planning.employee')} /></SelectTrigger>
                  <SelectContent className="bg-card border-white/10">{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={newEntry.client_site_id} onValueChange={(v) => setNewEntry({ ...newEntry, client_site_id: v })}>
                  <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder={t('dashboard.planning.client_site')} /></SelectTrigger>
                  <SelectContent className="bg-card border-white/10">{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.address}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={newEntry.day_of_week} onValueChange={(v) => setNewEntry({ ...newEntry, day_of_week: v })}>
                  <SelectTrigger className="bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-white/10">{DAYS_FR.map((d, i) => <SelectItem key={i} value={String(i + 1)}>{d}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="time" value={newEntry.start_time} onChange={(e) => setNewEntry({ ...newEntry, start_time: e.target.value })} className="bg-background/50 border-white/10" />
                  <Input type="time" value={newEntry.end_time} onChange={(e) => setNewEntry({ ...newEntry, end_time: e.target.value })} className="bg-background/50 border-white/10" />
                </div>
                <Button onClick={addEntry} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">{t('dashboard.planning.schedule')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={navigatePrev} className="text-muted-foreground h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-xs font-semibold text-foreground capitalize min-w-[180px] text-center">{headerLabel()}</span>
          <Button variant="ghost" size="icon" onClick={navigateNext} className="text-muted-foreground h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          <div className="flex border border-white/10 rounded-lg overflow-hidden ml-2">
            {(['timeline', 'week', 'day', 'month'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)} className={`px-2.5 py-1.5 text-[11px] capitalize transition-colors ${viewMode === v ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
                {v === 'timeline' ? t('dashboard.planning.timeline') : v === 'week' ? t('dashboard.planning.week_view') : v === 'day' ? t('dashboard.planning.day_view') : t('dashboard.planning.month_view')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === 'timeline' && (
        <div className="glass-card rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2 w-[140px]">{t('dashboard.planning.employee')}</th>
                {weekDays.map((d, i) => (
                  <th key={i} className="text-center text-xs text-muted-foreground font-medium px-2 py-2 border-l border-white/[0.03]">
                    <span className={isSameDay(d, new Date()) ? 'text-accent font-bold' : ''}>{format(d, 'EEE d', { locale: fr })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b border-white/[0.03]">
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: emp.color }} /><span className="text-sm text-foreground truncate">{emp.name}</span></div></td>
                  {weekDays.map((_, di) => {
                    const dayEntries = entries.filter(e => e.employee_id === emp.id && e.day_of_week === di + 1);
                    return (
                      <td key={di} className="px-1 py-1 border-l border-white/[0.03] align-top">
                        <div className="space-y-1">
                          {dayEntries.map(entry => (
                            <div key={entry.id} className="rounded p-1.5 text-[10px] border group relative" style={{ backgroundColor: `${emp.color}15`, borderColor: `${emp.color}30` }}>
                              <p className="font-medium text-foreground truncate">{entry.client_sites?.name}</p>
                              <p className="text-muted-foreground">{entry.start_time?.slice(0, 5)}–{entry.end_time?.slice(0, 5)}</p>
                              <button onClick={() => deleteEntry(entry.id)} className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20"><Trash2 className="w-2.5 h-2.5 text-red-400" /></button>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">{t('dashboard.planning.add_employees_start')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'week' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-6 border-b border-white/[0.06]">
            {weekDays.map((d, i) => (
              <div key={i} className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center border-r border-white/[0.03] last:border-r-0">
                <span className={isSameDay(d, new Date()) ? 'text-accent' : ''}>{format(d, 'EEE d', { locale: fr })}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-6 min-h-[400px]">
            {weekDays.map((_, dayIndex) => {
              const dayEntries = entries.filter(e => e.day_of_week === dayIndex + 1);
              return <div key={dayIndex} className="border-r border-white/[0.03] last:border-r-0 p-2 space-y-2">{dayEntries.map(entry => <EntryCard key={entry.id} entry={entry} />)}</div>;
            })}
          </div>
        </div>
      )}

      {viewMode === 'day' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="max-h-[550px] overflow-y-auto">
            {HOURS.map(h => {
              const spanEntries = entries.filter(e => {
                if (e.day_of_week !== currentDayOfWeek) return false;
                const s = parseInt(e.start_time?.slice(0, 2) || '0');
                const en = parseInt(e.end_time?.slice(0, 2) || '0');
                return h >= s && h < en;
              });
              const uniqueEntries = [...new Map(spanEntries.map(e => [e.id, e])).values()];
              return (
                <div key={h} className="grid grid-cols-[60px_1fr] border-b border-white/[0.03]">
                  <div className="text-xs text-muted-foreground text-right pr-3 py-3">{`${h}:00`}</div>
                  <div className="p-1.5 min-h-[50px] border-l border-white/[0.03]">{uniqueEntries.map(entry => <EntryCard key={entry.id} entry={entry} />)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'month' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/[0.06]">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
              <div key={d} className="px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day, i) => {
              const dow = day.getDay() === 0 ? 7 : day.getDay();
              const dayEntries = entries.filter(e => e.day_of_week === dow);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);
              return (
                <div key={i} className={`min-h-[80px] p-1.5 border-b border-r border-white/[0.03] ${!isCurrentMonth ? 'opacity-25' : ''}`}>
                  <span className={`text-xs font-medium inline-flex w-5 h-5 items-center justify-center rounded-full ${isToday ? 'bg-accent text-accent-foreground' : 'text-foreground'}`}>{format(day, 'd')}</span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayEntries.slice(0, 2).map(e => <EntryCard key={e.id} entry={e} compact />)}
                    {dayEntries.length > 2 && <p className="text-[9px] text-muted-foreground text-center">+{dayEntries.length - 2}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-accent" /><h3 className="text-sm font-medium text-foreground">{t('dashboard.planning.team')} ({employees.length})</h3></div>
          <div className="space-y-2">
            {employees.map(e => (
              <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-background/30">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color }} />
                <span className="text-sm text-foreground">{e.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{e.role}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><MapPin className="w-4 h-4 text-accent" /><h3 className="text-sm font-medium text-foreground">{t('dashboard.planning.client_sites')} ({sites.length})</h3></div>
          <div className="space-y-2">
            {sites.map(s => (
              <div key={s.id} className="p-2 rounded-lg bg-background/30">
                <p className="text-sm text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.address}{s.city ? `, ${s.city}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Planning;
