import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Phone, MapPin, Check, X, Clock, ChevronLeft, ChevronRight, User, Building2, Ruler, MessageSquare, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

type ViewMode = 'month' | 'week' | 'day' | 'list';

// Extended hours: 6:00 to 22:00
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

// Timezone-safe date helpers
function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseToLocal(isoStr: string): Date {
  return new Date(isoStr);
}

function localIsSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function formatBrusselsTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });
}

function formatBrusselsDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Brussels' });
}

function getBrusselsHour(isoStr: string): number {
  const parts = new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Brussels' });
  return parseInt(parts);
}

const Appointments = () => {
  const { t } = useTranslation();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(false);

  const fetchAppointments = async () => {
    const { data } = await supabase
      .from('appointments')
      .select('*, leads(id, contact_name, company_name, phone, whatsapp_number, email, location, address, surface_area, frequency, service_requested, space_type, score, status, language, active_agent)')
      .order('datetime', { ascending: true });
    if (data) setAppointments(data);
  };

  useEffect(() => { fetchAppointments(); }, []);

  const openDetail = useCallback(async (appt: any) => {
    setSelectedAppt(appt);
    if (appt.lead_id) {
      setLoadingConvos(true);
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', appt.lead_id)
        .order('created_at', { ascending: true })
        .limit(50);
      setConversations(data || []);
      setLoadingConvos(false);
    }
  }, []);

  const updateStatus = async (id: string, status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show") => {
    await supabase.from('appointments').update({ status }).eq('id', id);
    toast.success(t('dashboard.billing.status_updated'));
    fetchAppointments();
    if (selectedAppt?.id === id) setSelectedAppt((prev: any) => prev ? { ...prev, status } : null);

    // If marking as completed, trigger Lucas post-visit message
    if (status === 'completed') {
      const appt = appointments.find(a => a.id === id);
      if (appt?.lead_id) {
        try {
          const { data, error } = await supabase.functions.invoke('lucas-post-visit', {
            body: { action: 'post_visit', lead_id: appt.lead_id, appointment_id: id },
          });
          if (error) {
            console.error('Lucas post-visit error:', error);
            toast.error('Erro ao acionar Lucas pós-visita');
          } else {
            toast.success('✅ Lucas acionado — mensagem pós-visita enviada');
          }
        } catch (e) {
          console.error('Lucas trigger error:', e);
        }
      }
    }
  };

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      scheduled: 'bg-accent/20 text-accent border-accent/30',
      confirmed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      completed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
      no_show: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
    return styles[status] || 'bg-white/5 text-muted-foreground border-white/10';
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: '📅 Planifié', confirmed: '✅ Confirmé', completed: '✔️ Terminé',
      cancelled: '❌ Annulé', no_show: '⚠️ Absent',
    };
    return labels[status] || status;
  };

  const navigatePrev = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, -1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, -1));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const navigateNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const days: Date[] = []; let d = start;
    while (d <= end) { days.push(d); d = addDays(d, 1); }
    return days;
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const getApptsForDay = (day: Date) => filtered.filter(a => localIsSameDay(parseToLocal(a.datetime), day));

  const ApptMini = ({ appt }: { appt: any }) => (
    <div
      className={`px-1.5 py-0.5 rounded text-[10px] leading-tight truncate border cursor-pointer hover:opacity-80 transition-opacity ${statusBadge(appt.status)}`}
      onClick={(e) => { e.stopPropagation(); openDetail(appt); }}
    >
      {formatBrusselsTime(appt.datetime)} {appt.leads?.contact_name || 'RDV'}
    </div>
  );

  const ApptBlock = ({ appt }: { appt: any }) => (
    <div
      className={`px-2 py-1.5 rounded-lg text-xs border mb-1 cursor-pointer hover:opacity-80 transition-opacity ${statusBadge(appt.status)}`}
      onClick={() => openDetail(appt)}
    >
      <div className="font-medium truncate">{appt.leads?.contact_name || 'RDV'}</div>
      <div className="flex items-center gap-1 text-[10px] opacity-80">
        <Clock className="w-2.5 h-2.5" />{formatBrusselsTime(appt.datetime)}
        {appt.type === 'visit' ? <MapPin className="w-2.5 h-2.5 ml-1" /> : <Phone className="w-2.5 h-2.5 ml-1" />}
      </div>
    </div>
  );

  const headerLabel = () => {
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy', { locale: fr });
    if (viewMode === 'week') return `${format(weekDays[0], 'd MMM', { locale: fr })} — ${format(weekDays[6], 'd MMM yyyy', { locale: fr })}`;
    return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={navigatePrev} className="text-muted-foreground"><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="text-sm font-semibold text-foreground capitalize min-w-[200px] text-center">{headerLabel()}</h2>
          <Button variant="ghost" size="icon" onClick={navigateNext} className="text-muted-foreground"><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())} className="text-xs text-muted-foreground ml-1">{t('dashboard.appointments.today')}</Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] h-9 bg-card/50 border-white/10 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              <SelectItem value="all">{t('dashboard.appointments.all')}</SelectItem>
              <SelectItem value="scheduled">{t('dashboard.appointments.scheduled')}</SelectItem>
              <SelectItem value="confirmed">{t('dashboard.appointments.confirmed')}</SelectItem>
              <SelectItem value="completed">{t('dashboard.appointments.completed')}</SelectItem>
              <SelectItem value="cancelled">{t('dashboard.appointments.cancelled')}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            {(['month', 'week', 'day', 'list'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)} className={`px-3 py-1.5 text-xs capitalize transition-colors ${viewMode === v ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
                {t(`dashboard.appointments.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Month View */}
      {viewMode === 'month' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/[0.06]">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
              <div key={d} className="px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day, i) => {
              const dayAppts = getApptsForDay(day);
              const isToday = localIsSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);
              return (
                <div key={i} className={`min-h-[90px] p-1.5 border-b border-r border-white/[0.03] ${!isCurrentMonth ? 'opacity-30' : ''}`} onClick={() => { setCurrentDate(day); setViewMode('day'); }}>
                  <span className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full cursor-pointer ${isToday ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-white/5'}`}>{format(day, 'd')}</span>
                  <div className="mt-1 space-y-0.5">
                    {dayAppts.slice(0, 3).map(a => <ApptMini key={a.id} appt={a} />)}
                    {dayAppts.length > 3 && <p className="text-[10px] text-muted-foreground text-center">+{dayAppts.length - 3}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === 'week' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/[0.06]">
            <div />
            {weekDays.map((d, i) => (
              <div key={i} className="px-1 py-2 text-center border-l border-white/[0.03]">
                <span className="text-[10px] text-muted-foreground uppercase">{format(d, 'EEE', { locale: fr })}</span>
                <span className={`block text-sm font-medium mt-0.5 ${localIsSameDay(d, new Date()) ? 'text-accent' : 'text-foreground'}`}>{format(d, 'd')}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[60px_repeat(7,1fr)] max-h-[500px] overflow-y-auto">
            {HOURS.map(h => (
              <div key={h} className="contents">
                <div className="text-[10px] text-muted-foreground text-right pr-2 py-2 border-b border-white/[0.02]">{`${h}:00`}</div>
                {weekDays.map((d, di) => {
                  const hourAppts = filtered.filter(a => localIsSameDay(parseToLocal(a.datetime), d) && getBrusselsHour(a.datetime) === h);
                  return (
                    <div key={di} className="border-l border-b border-white/[0.03] p-0.5 min-h-[50px]">
                      {hourAppts.map(a => <ApptBlock key={a.id} appt={a} />)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day View */}
      {viewMode === 'day' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            {HOURS.map(h => {
              const hourAppts = filtered.filter(a => localIsSameDay(parseToLocal(a.datetime), currentDate) && getBrusselsHour(a.datetime) === h);
              return (
                <div key={h} className="grid grid-cols-[60px_1fr] border-b border-white/[0.03]">
                  <div className="text-xs text-muted-foreground text-right pr-3 py-3">{`${h}:00`}</div>
                  <div className="p-1.5 min-h-[50px] border-l border-white/[0.03]">
                    {hourAppts.map(a => (
                      <div
                        key={a.id}
                        className={`p-3 rounded-lg border mb-1 cursor-pointer hover:opacity-80 transition-opacity ${statusBadge(a.status)}`}
                        onClick={() => openDetail(a)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{a.leads?.contact_name || 'RDV'} {a.leads?.company_name ? `— ${a.leads.company_name}` : ''}</p>
                            <div className="flex items-center gap-3 text-xs mt-1 opacity-80">
                              <span>{formatBrusselsTime(a.datetime)}</span>
                              <span className="capitalize">{a.type === 'visit' ? `📍 ${t('dashboard.appointments.visit')}` : `📞 ${t('dashboard.appointments.call')}`}</span>
                              {a.location && <span>{a.location}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {a.status === 'scheduled' && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateStatus(a.id, 'confirmed'); }} className="text-[10px] h-7 border-white/10"><Check className="w-3 h-3" /></Button>}
                            {(a.status === 'scheduled' || a.status === 'confirmed') && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateStatus(a.id, 'cancelled'); }} className="text-[10px] h-7 border-white/10"><X className="w-3 h-3" /></Button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="grid gap-4">
          {filtered.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center text-muted-foreground text-sm">{t('dashboard.appointments.no_appointments')}</div>
          ) : (
            filtered.map((appt) => (
              <div
                key={appt.id}
                className="glass-card rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => openDetail(appt)}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${appt.type === 'visit' ? 'bg-accent/15 border border-accent/20' : 'bg-emerald-500/15 border border-emerald-500/20'}`}>
                  {appt.type === 'visit' ? <MapPin className="w-5 h-5 text-accent" /> : <Phone className="w-5 h-5 text-emerald-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{appt.leads?.contact_name || 'Lead'} {appt.leads?.company_name ? `— ${appt.leads.company_name}` : ''}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusBadge(appt.status)}`}>{appt.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatBrusselsDate(appt.datetime)}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatBrusselsTime(appt.datetime)}</span>
                    {appt.location && <span>{appt.location}</span>}
                    <span className="capitalize">{appt.type === 'visit' ? t('dashboard.appointments.visit') : t('dashboard.appointments.call')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {appt.status === 'scheduled' && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateStatus(appt.id, 'confirmed'); }} className="text-xs border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400"><Check className="w-3 h-3 mr-1" /> {t('dashboard.appointments.confirm')}</Button>}
                  {(appt.status === 'scheduled' || appt.status === 'confirmed') && (
                    <>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateStatus(appt.id, 'completed'); }} className="text-xs border-white/10 hover:bg-purple-500/10 hover:text-purple-400">{t('dashboard.appointments.completed')}</Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateStatus(appt.id, 'no_show'); }} className="text-xs border-white/10 hover:bg-amber-500/10 hover:text-amber-400">{t('dashboard.appointments.no_show')}</Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateStatus(appt.id, 'cancelled'); }} className="text-xs border-white/10 hover:bg-red-500/10 hover:text-red-400"><X className="w-3 h-3" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Appointment Detail Dialog */}
      <Dialog open={!!selectedAppt} onOpenChange={(open) => { if (!open) { setSelectedAppt(null); setConversations([]); } }}>
        <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              {selectedAppt?.type === 'visit' ? <MapPin className="w-5 h-5 text-accent" /> : <Phone className="w-5 h-5 text-emerald-400" />}
              {selectedAppt?.type === 'visit' ? 'Visite' : 'Appel'}
              {selectedAppt && (
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ml-2 ${statusBadge(selectedAppt.status)}`}>
                  {statusLabel(selectedAppt.status)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedAppt && (
            <ScrollArea className="flex-1 overflow-y-auto pr-2">
              <div className="space-y-5">
                {/* Date & Location */}
                <div className="glass-card rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Rendez-vous</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Date</span>
                      <p className="text-foreground capitalize">{formatBrusselsDate(selectedAppt.datetime)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Heure</span>
                      <p className="text-foreground">{formatBrusselsTime(selectedAppt.datetime)}</p>
                    </div>
                    {selectedAppt.location && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">Lieu</span>
                        <p className="text-foreground">{selectedAppt.location}</p>
                      </div>
                    )}
                    {selectedAppt.notes && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">Notes</span>
                        <p className="text-foreground text-xs">{selectedAppt.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lead Info */}
                {selectedAppt.leads && (
                  <div className="glass-card rounded-xl p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><User className="w-4 h-4 text-accent" /> Informations du lead</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {selectedAppt.leads.contact_name && (
                        <div>
                          <span className="text-muted-foreground text-xs">Contact</span>
                          <p className="text-foreground">{selectedAppt.leads.contact_name}</p>
                        </div>
                      )}
                      {selectedAppt.leads.company_name && (
                        <div>
                          <span className="text-muted-foreground text-xs">Entreprise</span>
                          <p className="text-foreground">{selectedAppt.leads.company_name}</p>
                        </div>
                      )}
                      {selectedAppt.leads.phone && (
                        <div>
                          <span className="text-muted-foreground text-xs">Téléphone</span>
                          <p className="text-foreground">{selectedAppt.leads.phone}</p>
                        </div>
                      )}
                      {selectedAppt.leads.whatsapp_number && (
                        <div>
                          <span className="text-muted-foreground text-xs">WhatsApp</span>
                          <p className="text-foreground">{selectedAppt.leads.whatsapp_number}</p>
                        </div>
                      )}
                      {selectedAppt.leads.email && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs">Email</span>
                          <p className="text-foreground">{selectedAppt.leads.email}</p>
                        </div>
                      )}
                      {selectedAppt.leads.location && (
                        <div>
                          <span className="text-muted-foreground text-xs">Localisation</span>
                          <p className="text-foreground">{selectedAppt.leads.location}</p>
                        </div>
                      )}
                      {selectedAppt.leads.address && (
                        <div>
                          <span className="text-muted-foreground text-xs">Adresse</span>
                          <p className="text-foreground">{selectedAppt.leads.address}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Qualification Details */}
                {selectedAppt.leads && (selectedAppt.leads.service_requested || selectedAppt.leads.surface_area || selectedAppt.leads.frequency || selectedAppt.leads.space_type) && (
                  <div className="glass-card rounded-xl p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Ruler className="w-4 h-4 text-accent" /> Détails de qualification</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {selectedAppt.leads.service_requested && (
                        <div>
                          <span className="text-muted-foreground text-xs">Service</span>
                          <p className="text-foreground">{selectedAppt.leads.service_requested}</p>
                        </div>
                      )}
                      {selectedAppt.leads.space_type && (
                        <div>
                          <span className="text-muted-foreground text-xs">Type d'espace</span>
                          <p className="text-foreground">{selectedAppt.leads.space_type}</p>
                        </div>
                      )}
                      {selectedAppt.leads.surface_area && (
                        <div>
                          <span className="text-muted-foreground text-xs">Surface (m²)</span>
                          <p className="text-foreground font-medium">{selectedAppt.leads.surface_area}</p>
                        </div>
                      )}
                      {selectedAppt.leads.frequency && (
                        <div>
                          <span className="text-muted-foreground text-xs">Fréquence</span>
                          <p className="text-foreground">{selectedAppt.leads.frequency}</p>
                        </div>
                      )}
                      {selectedAppt.leads.score && (
                        <div>
                          <span className="text-muted-foreground text-xs">Score</span>
                          <p className={`font-semibold ${selectedAppt.leads.score === 'HOT' ? 'text-red-400' : selectedAppt.leads.score === 'WARM' ? 'text-amber-400' : 'text-blue-400'}`}>
                            {selectedAppt.leads.score === 'HOT' ? '🔥' : selectedAppt.leads.score === 'WARM' ? '🌡️' : '❄️'} {selectedAppt.leads.score}
                          </p>
                        </div>
                      )}
                      {selectedAppt.leads.language && (
                        <div>
                          <span className="text-muted-foreground text-xs">Langue</span>
                          <p className="text-foreground uppercase">{selectedAppt.leads.language}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Conversation History */}
                <div className="glass-card rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-accent" /> Historique de conversation</h3>
                  {loadingConvos ? (
                    <p className="text-xs text-muted-foreground animate-pulse">Chargement...</p>
                  ) : conversations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune conversation trouvée</p>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {conversations.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-2.5 rounded-lg text-xs ${
                            msg.role === 'assistant'
                              ? 'bg-accent/10 border border-accent/15 ml-0 mr-8'
                              : msg.role === 'system'
                              ? 'bg-purple-500/10 border border-purple-500/15 mx-4'
                              : 'bg-white/5 border border-white/10 ml-8 mr-0'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {msg.role === 'assistant' ? (msg.agent || 'Agent') : msg.role === 'user' ? 'Client' : 'Système'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(msg.created_at).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })}
                            </span>
                          </div>
                          <p className="text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pb-2">
                  {selectedAppt.status === 'scheduled' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(selectedAppt.id, 'confirmed')} className="text-xs border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400">
                      <Check className="w-3 h-3 mr-1" /> Confirmer
                    </Button>
                  )}
                  {(selectedAppt.status === 'scheduled' || selectedAppt.status === 'confirmed') && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selectedAppt.id, 'completed')} className="text-xs border-purple-500/30 hover:bg-purple-500/10 text-purple-400">
                        Terminé
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selectedAppt.id, 'no_show')} className="text-xs border-amber-500/30 hover:bg-amber-500/10 text-amber-400">
                        Absent
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selectedAppt.id, 'cancelled')} className="text-xs border-red-500/30 hover:bg-red-500/10 text-red-400">
                        <X className="w-3 h-3 mr-1" /> Annuler
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Appointments;