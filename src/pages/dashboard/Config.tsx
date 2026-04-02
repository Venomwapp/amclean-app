import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Save, Bot, ToggleLeft, ToggleRight, Clock, Bell, Wifi, WifiOff, TestTube, Users, UserPlus, Trash2, Shield, Loader2, Smartphone, QrCode, RefreshCw, LogOut, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const Config = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editTemp, setEditTemp] = useState('0.3');
  const [editMaxTokens, setEditMaxTokens] = useState('500');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [processingFollowups, setProcessingFollowups] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<Record<string, boolean>>({});
  const [checkingSecrets, setCheckingSecrets] = useState(false);

  // WhatsApp instance state
  const [waStatus, setWaStatus] = useState<'loading' | 'connected' | 'disconnected' | 'connecting' | 'not_configured' | 'error'>('loading');
  const [waInstance, setWaInstance] = useState<string | null>(null);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waProfileName, setWaProfileName] = useState<string | null>(null);
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [waQrCountdown, setWaQrCountdown] = useState<number>(0);
  const [waLoadingQr, setWaLoadingQr] = useState(false);
  const [waRestarting, setWaRestarting] = useState(false);
  const [waLoggingOut, setWaLoggingOut] = useState(false);

  // User management state
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [revokingUser, setRevokingUser] = useState<string | null>(null);

  const fetchAgents = async () => {
    const { data } = await supabase.from('agent_configs').select('*').order('agent_name');
    if (data) setAgents(data);
  };

  const fetchAdminUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'list' }),
      });
      const result = await resp.json();
      if (result.admins) setAdminUsers(result.admins);
    } catch (e) {
      console.error('Failed to fetch admins:', e);
    }
    setLoadingUsers(false);
  };

  // WhatsApp instance functions
  const fetchWaStatus = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'status' }),
      });
      const result = await resp.json();
      if (result.status === 'not_configured') {
        setWaStatus('not_configured');
      } else if (result.status === 'connected') {
        setWaStatus('connected');
        setWaInstance(result.instance);
        setWaPhone(result.phone_number);
        setWaProfileName(result.profile_name);
        setWaQrCode(null);
      } else if (result.status === 'connecting') {
        setWaStatus('connecting');
        setWaInstance(result.instance);
      } else {
        setWaStatus('disconnected');
        setWaInstance(result.instance);
      }
    } catch (e) {
      setWaStatus('error');
      console.error('WhatsApp status error:', e);
    }
  }, []);

  const fetchQrCode = async () => {
    setWaLoadingQr(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'qrcode' }),
      });
      const result = await resp.json();
      if (result.qr_base64) {
        setWaQrCode(result.qr_base64);
        setWaQrCountdown(40);
        // Countdown timer
        const countdownInterval = setInterval(() => {
          setWaQrCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              setWaQrCode(null);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        // Poll for connection while QR is active
        const interval = setInterval(async () => {
          await fetchWaStatus();
        }, 5000);
        setTimeout(() => {
          clearInterval(interval);
          clearInterval(countdownInterval);
        }, 45000);
      } else if (result.pairing_code) {
        toast.info(`Pairing code: ${result.pairing_code}`);
      } else {
        toast.error('Não foi possível obter o QR Code');
      }
    } catch (e) {
      toast.error('Erro: ' + String(e));
    }
    setWaLoadingQr(false);
  };

  const restartInstance = async () => {
    setWaRestarting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'restart' }),
      });
      toast.success('Instância reiniciada');
      setTimeout(() => fetchWaStatus(), 3000);
    } catch (e) {
      toast.error('Erro: ' + String(e));
    }
    setWaRestarting(false);
  };

  const logoutInstance = async () => {
    setWaLoggingOut(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'logout' }),
      });
      toast.success('WhatsApp desconectado');
      setWaStatus('disconnected');
      setWaPhone(null);
      setWaProfileName(null);
      setWaQrCode(null);
    } catch (e) {
      toast.error('Erro: ' + String(e));
    }
    setWaLoggingOut(false);
  };

  useEffect(() => { fetchAgents(); fetchAdminUsers(); fetchWaStatus(); }, [fetchWaStatus]);

  const createAdmin = async () => {
    if (!newEmail || !newPassword) {
      toast.error(t('dashboard.config.email_password_required'));
      return;
    }
    setCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'create', email: newEmail, password: newPassword, display_name: newDisplayName || newEmail }),
      });
      const result = await resp.json();
      if (result.success) {
        toast.success(t('dashboard.config.admin_created'));
        setNewEmail(''); setNewPassword(''); setNewDisplayName('');
        fetchAdminUsers();
      } else {
        toast.error(result.error || 'Error');
      }
    } catch (e) { toast.error(String(e)); }
    setCreatingUser(false);
  };

  const revokeAdmin = async (userId: string) => {
    setRevokingUser(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'revoke', user_id: userId }),
      });
      const result = await resp.json();
      if (result.success) {
        toast.success(t('dashboard.config.admin_revoked'));
        fetchAdminUsers();
      } else {
        toast.error(result.error || 'Error');
      }
    } catch (e) { toast.error(String(e)); }
    setRevokingUser(null);
  };

  const toggleAgent = async (id: string, currentState: boolean) => {
    await supabase.from('agent_configs').update({ is_active: !currentState }).eq('id', id);
    toast.success(!currentState ? t('dashboard.config.agent_activated') : t('dashboard.config.agent_deactivated'));
    fetchAgents();
  };

  const startEdit = (agent: any) => {
    setEditingAgent(agent.id);
    setEditPrompt(agent.system_prompt);
    setEditTemp(String(agent.temperature));
    setEditMaxTokens(String(agent.max_tokens));
  };

  const saveEdit = async () => {
    if (!editingAgent) return;
    await supabase.from('agent_configs').update({
      system_prompt: editPrompt, temperature: parseFloat(editTemp), max_tokens: parseInt(editMaxTokens),
    }).eq('id', editingAgent);
    toast.success(t('dashboard.config.config_saved'));
    setEditingAgent(null);
    fetchAgents();
  };

  const testWebhook = async () => {
    setTestingWebhook(true);
    try {
      const testPayload = {
        event: "messages.upsert",
        data: { key: { remoteJid: "32470000000@s.whatsapp.net", fromMe: false }, message: { conversation: "Bonjour, je cherche un service de nettoyage pour mes bureaux à Bruxelles. Environ 200m². C'est urgent." }, messageType: "conversation" },
      };
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-evolution`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(testPayload),
      });
      const result = await resp.json();
      if (result.status === "ok") toast.success(`Webhook OK — Lead: ${result.lead_id?.substring(0, 8)}...`);
      else toast.info(`Webhook: ${result.status} — ${result.message || ""}`);
    } catch (e) { toast.error("Error: " + String(e)); }
    setTestingWebhook(false);
  };

  const triggerFollowups = async () => {
    setProcessingFollowups(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-followups`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await resp.json();
      toast.success(`Follow-ups — ${result.processed} / ${result.sent} / ${result.cancelled}`);
    } catch (e) { toast.error(String(e)); }
    setProcessingFollowups(false);
  };

  const triggerReminders = async () => {
    setSendingReminders(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminders`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await resp.json();
      toast.success(`Reminders — ${result.processed} / ${result.sent}`);
    } catch (e) { toast.error(String(e)); }
    setSendingReminders(false);
  };

  const checkSecrets = async () => {
    setCheckingSecrets(true);
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-evolution`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "check" }),
      });
      setSecretsStatus({
        LOVABLE_API_KEY: true, EVOLUTION_API_URL: false, EVOLUTION_API_KEY: false, EVOLUTION_INSTANCE_NAME: false, MEIRYLAINE_WHATSAPP: false,
      });
    } catch { setSecretsStatus({}); }
    setCheckingSecrets(false);
  };

  useEffect(() => { checkSecrets(); }, []);

  const REQUIRED_SECRETS = [
    { name: "LOVABLE_API_KEY", label: "LLM (Lovable AI)", description: "Auto-configured" },
    { name: "SERPER_API_KEY", label: "Serper API (Google Maps)", description: "Prospecção via Google Maps" },
    { name: "EVOLUTION_API_URL", label: "Evolution API URL", description: "Instance URL" },
    { name: "EVOLUTION_API_KEY", label: "Evolution API Key", description: "API Key" },
    { name: "EVOLUTION_INSTANCE_NAME", label: "WhatsApp Instance", description: "Instance name" },
    { name: "MEIRYLAINE_WHATSAPP", label: "WhatsApp Meyri", description: "Escalation number" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* WhatsApp Connection */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-medium text-foreground">WhatsApp</h2>
        </div>

        {waStatus === 'loading' ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : waStatus === 'not_configured' ? (
          <div className="flex items-center gap-3 py-4 px-4 rounded-lg bg-background/30">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-foreground">Evolution API não configurada</p>
              <p className="text-xs text-muted-foreground">Configure os secrets EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME</p>
            </div>
          </div>
        ) : waStatus === 'connected' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 py-4 px-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Conectado</p>
                {waPhone && <p className="text-xs text-emerald-400 font-mono">+{waPhone.replace('@s.whatsapp.net', '')}</p>}
                {!waPhone && waProfileName && <p className="text-xs text-muted-foreground">{waProfileName}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={restartInstance}
                  disabled={waRestarting}
                  className="border-white/10 text-xs"
                >
                  {waRestarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span className="ml-1.5">Reiniciar</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={logoutInstance}
                  disabled={waLoggingOut}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
                >
                  {waLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                  <span className="ml-1.5">Desconectar</span>
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Instância utilizada pelos agentes para enviar e receber mensagens WhatsApp.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 py-4 px-4 rounded-lg bg-background/30 border border-white/[0.06]">
              <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Desconectado</p>
                <p className="text-xs text-muted-foreground">Nenhum dispositivo conectado</p>
                <p className="text-xs text-muted-foreground/60">Escaneie o QR Code para conectar</p>
              </div>
              <Button
                onClick={fetchQrCode}
                disabled={waLoadingQr}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                {waLoadingQr ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <QrCode className="w-4 h-4 mr-1.5" />}
                Gerar QR Code
              </Button>
            </div>

            {waQrCode && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="bg-white p-4 rounded-xl">
                  <img src={waQrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-foreground font-medium">Escaneie com o WhatsApp</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Abra o WhatsApp → Menu (⋮) → Dispositivos conectados → Conectar dispositivo
                  </p>
                  <div className="flex items-center gap-2 mt-3 justify-center">
                    <Loader2 className="w-3 h-3 animate-spin text-accent" />
                    <span className="text-[10px] text-muted-foreground">Aguardando conexão... ({waQrCountdown}s)</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchQrCode}
                  className="border-white/10 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Gerar novo QR Code
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Management */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-accent" />
          <h2 className="text-sm font-medium text-foreground">{t('dashboard.config.user_management')}</h2>
        </div>
        
        {/* Admin list */}
        <div className="space-y-2 mb-5">
          {loadingUsers ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : adminUsers.map((admin) => (
            <div key={admin.user_id} className="flex items-center justify-between py-3 px-4 rounded-lg bg-background/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{admin.display_name || admin.email}</p>
                  <p className="text-xs text-muted-foreground">{admin.email}</p>
                </div>
                {admin.user_id === user?.id && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
                    {t('dashboard.config.you')}
                  </span>
                )}
              </div>
              {admin.user_id !== user?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeAdmin(admin.user_id)}
                  disabled={revokingUser === admin.user_id}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {revokingUser === admin.user_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Add new admin */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4 text-accent" />
            <h3 className="text-xs font-medium text-foreground uppercase tracking-wider">{t('dashboard.config.invite_admin')}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Input
              placeholder={t('dashboard.config.admin_name')}
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="bg-background/50 border-white/10 text-sm"
            />
            <Input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="bg-background/50 border-white/10 text-sm"
            />
            <Input
              type="password"
              placeholder={t('dashboard.config.admin_password')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-background/50 border-white/10 text-sm"
            />
          </div>
          <Button
            onClick={createAdmin}
            disabled={creatingUser || !newEmail || !newPassword}
            className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs"
          >
            {creatingUser ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
            {t('dashboard.config.create_admin')}
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-sm font-medium text-foreground mb-4">⚡ {t('dashboard.config.quick_actions')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button onClick={testWebhook} disabled={testingWebhook} variant="outline" className="border-white/10 h-auto py-3 flex flex-col items-center gap-2">
            <TestTube className="w-5 h-5 text-accent" />
            <span className="text-xs">{testingWebhook ? t('dashboard.config.testing') : t('dashboard.config.test_webhook')}</span>
          </Button>
          <Button onClick={triggerFollowups} disabled={processingFollowups} variant="outline" className="border-white/10 h-auto py-3 flex flex-col items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <span className="text-xs">{processingFollowups ? t('dashboard.config.processing') : t('dashboard.config.process_followups')}</span>
          </Button>
          <Button onClick={triggerReminders} disabled={sendingReminders} variant="outline" className="border-white/10 h-auto py-3 flex flex-col items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-400" />
            <span className="text-xs">{sendingReminders ? t('dashboard.config.sending') : t('dashboard.config.send_reminders')}</span>
          </Button>
        </div>
      </div>


      {/* AI Agents */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">🤖 {t('dashboard.config.ai_agents')}</h2>
        {agents.map((agent) => (
          <div key={agent.id} className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center"><Bot className="w-5 h-5 text-accent" /></div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">{agent.display_name}</h3>
                  <p className="text-xs text-muted-foreground">{t('dashboard.config.temp')}: {agent.temperature} | {t('dashboard.config.max_tokens')}: {agent.max_tokens}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleAgent(agent.id, agent.is_active)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {agent.is_active ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                </button>
                {editingAgent !== agent.id && (
                  <Button variant="outline" size="sm" onClick={() => startEdit(agent)} className="text-xs border-white/10">{t('dashboard.config.modify')}</Button>
                )}
              </div>
            </div>
            {editingAgent === agent.id ? (
              <div className="space-y-4">
                <Textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={12} className="bg-background/50 border-white/10 text-sm font-mono" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.config.temp')}</label>
                    <Input type="number" step="0.1" min="0" max="1" value={editTemp} onChange={(e) => setEditTemp(e.target.value)} className="bg-background/50 border-white/10" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('dashboard.config.max_tokens')}</label>
                    <Input type="number" value={editMaxTokens} onChange={(e) => setEditMaxTokens(e.target.value)} className="bg-background/50 border-white/10" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={saveEdit} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Save className="w-4 h-4 mr-2" /> {t('dashboard.config.save')}</Button>
                  <Button variant="outline" onClick={() => setEditingAgent(null)} className="border-white/10">{t('dashboard.config.cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="bg-background/30 rounded-lg p-4 max-h-[200px] overflow-y-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{agent.system_prompt}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Config;
