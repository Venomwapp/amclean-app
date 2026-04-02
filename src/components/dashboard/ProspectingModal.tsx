import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Plus, Trash2, Zap, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ProspectingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface ProspectingConfig {
  id: string;
  niche: string;
  region: string;
  is_active: boolean;
  max_leads_per_run: number;
}

interface ProspectingRun {
  id: string;
  status: string;
  leads_found: number;
  leads_qualified: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export const ProspectingModal = ({ open, onOpenChange, onComplete }: ProspectingModalProps) => {
  const [configs, setConfigs] = useState<ProspectingConfig[]>([]);
  const [runs, setRuns] = useState<ProspectingRun[]>([]);
  const [newNiche, setNewNiche] = useState('');
  const [newRegion, setNewRegion] = useState('Belgique');
  const [selectedConfig, setSelectedConfig] = useState<string>('');
  const [customNiche, setCustomNiche] = useState('');
  const [customRegion, setCustomRegion] = useState('Belgique');
  const [isProspecting, setIsProspecting] = useState(false);
  const [prospectMode, setProspectMode] = useState<'config' | 'custom'>('config');

  const fetchConfigs = async () => {
    const { data } = await supabase
      .from('prospecting_configs')
      .select('*')
      .order('created_at', { ascending: false }) as { data: ProspectingConfig[] | null };
    if (data) setConfigs(data);
  };

  const fetchRuns = async () => {
    const { data } = await supabase
      .from('prospecting_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(5) as { data: ProspectingRun[] | null };
    if (data) setRuns(data);
  };

  useEffect(() => {
    if (open) {
      fetchConfigs();
      fetchRuns();
    }
  }, [open]);

  const addConfig = async () => {
    if (!newNiche.trim()) return;
    const { error } = await supabase.from('prospecting_configs').insert({
      niche: newNiche.trim(),
      region: newRegion.trim(),
    });
    if (error) {
      toast.error('Erreur: ' + error.message);
    } else {
      toast.success('Niche ajoutée');
      setNewNiche('');
      fetchConfigs();
    }
  };

  const removeConfig = async (id: string) => {
    await supabase.from('prospecting_configs').delete().eq('id', id);
    toast.success('Niche supprimée');
    fetchConfigs();
  };

  const toggleConfig = async (id: string, current: boolean) => {
    await supabase.from('prospecting_configs').update({ is_active: !current }).eq('id', id);
    fetchConfigs();
  };

  const startProspecting = async () => {
    setIsProspecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const body = prospectMode === 'config' && selectedConfig
        ? { config_id: selectedConfig }
        : { niche: customNiche, region: customRegion };

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sofia-prospect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const result = await resp.json();
      
      if (result.success) {
        toast.success(
          `🔍 Sofia trouvou ${result.leads_found} leads — ${result.leads_inserted} inseridos (${result.leads_qualified} qualificados)`
        );
        onComplete();
        fetchRuns();
      } else {
        toast.error(`Erro: ${result.error}`);
      }
    } catch (e) {
      toast.error('Erro na prospecção: ' + String(e));
    }
    setIsProspecting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-white/10 max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Sofia — Prospecção
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Niche configurations */}
          <div>
            <h3 className="text-xs font-medium text-foreground uppercase tracking-wider mb-3">
              Nichos configurados
            </h3>
            <div className="space-y-2 mb-3">
              {configs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum nicho configurado. Adicione abaixo.
                </p>
              ) : (
                configs.map((config) => (
                  <div
                    key={config.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      config.is_active
                        ? 'bg-accent/5 border-accent/20'
                        : 'bg-background/30 border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleConfig(config.id, config.is_active)}
                        className={`w-2 h-2 rounded-full ${
                          config.is_active ? 'bg-emerald-400' : 'bg-muted-foreground/30'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{config.niche}</p>
                        <p className="text-xs text-muted-foreground">{config.region} · max {config.max_leads_per_run}/run</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeConfig(config.id)}
                      className="text-muted-foreground hover:text-destructive h-8 w-8"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Add new niche */}
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Restaurants, Cliniques..."
                value={newNiche}
                onChange={(e) => setNewNiche(e.target.value)}
                className="bg-background/50 border-white/10 text-sm flex-1"
              />
              <Input
                placeholder="Région"
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value)}
                className="bg-background/50 border-white/10 text-sm w-32"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={addConfig}
                disabled={!newNiche.trim()}
                className="border-white/10"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Prospect now */}
          <div className="border-t border-white/10 pt-4">
            <h3 className="text-xs font-medium text-foreground uppercase tracking-wider mb-3">
              Prospectar agora
            </h3>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setProspectMode('config')}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  prospectMode === 'config'
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : 'text-muted-foreground border border-white/10'
                }`}
              >
                Usar nicho salvo
              </button>
              <button
                onClick={() => setProspectMode('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  prospectMode === 'custom'
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : 'text-muted-foreground border border-white/10'
                }`}
              >
                Busca personalizada
              </button>
            </div>

            {prospectMode === 'config' ? (
              <Select value={selectedConfig} onValueChange={setSelectedConfig}>
                <SelectTrigger className="bg-background/50 border-white/10 mb-3">
                  <SelectValue placeholder="Selecione um nicho" />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {configs.filter(c => c.is_active).map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.niche} — {config.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Nicho (ex: Restaurants)"
                  value={customNiche}
                  onChange={(e) => setCustomNiche(e.target.value)}
                  className="bg-background/50 border-white/10 text-sm flex-1"
                />
                <Input
                  placeholder="Região"
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value)}
                  className="bg-background/50 border-white/10 text-sm w-32"
                />
              </div>
            )}

            <Button
              onClick={startProspecting}
              disabled={
                isProspecting ||
                (prospectMode === 'config' && !selectedConfig) ||
                (prospectMode === 'custom' && !customNiche.trim())
              }
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isProspecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Sofia está prospectando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Iniciar prospecção
                </>
              )}
            </Button>
          </div>

          {/* Recent runs */}
          {runs.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-xs font-medium text-foreground uppercase tracking-wider mb-3">
                Execuções recentes
              </h3>
              <div className="space-y-2">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-background/30"
                  >
                    <div className="flex items-center gap-2">
                      {run.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : run.status === 'error' ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin text-accent" />
                      )}
                      <div>
                        <p className="text-xs text-foreground">
                          {run.leads_found} encontrados · {run.leads_qualified} qualificados
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(run.started_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        run.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : run.status === 'error'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-accent/10 text-accent'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
