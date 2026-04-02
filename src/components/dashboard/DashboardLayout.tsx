import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard, Users, MessageSquare, CalendarDays, Settings,
  ClipboardList, LogOut, Menu, X, Euro, Globe, Bot, ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import amCleanLogo from '@/assets/am-clean-logo.png';

interface DashboardLayoutProps {
  children: ReactNode;
}

const AGENT_COLORS: Record<string, string> = {
  sophie: 'bg-violet-400',
  claire: 'bg-blue-400',
  lucas: 'bg-amber-400',
  emma: 'bg-emerald-400',
};

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, boolean>>({});
  const [hotLeads, setHotLeads] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      const [agentsRes, leadsRes] = await Promise.all([
        supabase.from('agent_configs').select('agent_name, is_active'),
        supabase.from('leads').select('score').eq('score', 'HOT').not('status', 'in', '("converted","lost")'),
      ]);
      if (agentsRes.data) {
        const map: Record<string, boolean> = {};
        agentsRes.data.forEach((a: any) => { map[a.agent_name] = a.is_active; });
        setAgentStatuses(map);
      }
      setHotLeads(leadsRes.data?.length || 0);
    };
    fetch();
  }, [location.pathname]);

  const navSections = [
    {
      label: t('dashboard.nav.direction'),
      items: [
        { path: '/', label: t('dashboard.nav.overview'), icon: LayoutDashboard },
      ],
    },
    {
      label: t('dashboard.nav.commercial'),
      items: [
        { path: '/leads', label: t('dashboard.nav.leads'), icon: Users, badge: hotLeads > 0 ? hotLeads : undefined },
        { path: '/conversations', label: t('dashboard.nav.conversations'), icon: MessageSquare },
        { path: '/appointments', label: t('dashboard.nav.appointments'), icon: CalendarDays },
      ],
    },
    {
      label: t('dashboard.nav.operations'),
      items: [
        { path: '/planning', label: t('dashboard.nav.planning'), icon: ClipboardList },
      ],
    },
    {
      label: t('dashboard.nav.admin'),
      items: [
        { path: '/billing', label: t('dashboard.nav.billing'), icon: Euro },
      ],
    },
    {
      label: t('dashboard.nav.system'),
      items: [
        { path: '/agents', label: t('dashboard.nav.agents'), icon: Bot },
        { path: '/config', label: t('dashboard.nav.config'), icon: Settings },
      ],
    },
  ];

  const allNavItems = navSections.flatMap(s => s.items);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const changeDashboardLang = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-60';

  return (
    <div className="min-h-screen bg-background flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen ${sidebarWidth} bg-card border-r border-border/50 flex flex-col transition-all duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 h-14">
          <Link to="/" className="flex items-center">
            <img src={amCleanLogo} alt="AM Clean" className={`${collapsed ? 'h-7' : 'h-8'} w-auto transition-all`} />
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Agent Status Strip */}
        {!collapsed && (
          <div className="px-4 py-2.5 border-b border-border/50">
            <div className="flex items-center gap-1.5">
              {['sophie', 'claire', 'lucas', 'emma'].map(name => (
                <div key={name} className="flex items-center gap-1 flex-1 justify-center" title={`${name}: ${agentStatuses[name] ? 'active' : 'inactive'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${agentStatuses[name] ? AGENT_COLORS[name] : 'bg-muted-foreground/30'}`} />
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{name[0].toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-1">
              {!collapsed && (
                <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium px-4 pt-3 pb-1">{section.label}</p>
              )}
              {section.items.map((item: any) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-[13px] transition-all relative ${
                    isActive(item.path)
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  {isActive(item.path) && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-accent rounded-r" />
                  )}
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${collapsed ? 'mx-auto' : ''}`} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full w-5 h-5 flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border/50 p-2 space-y-1">
          {!collapsed && (
            <div className="flex items-center gap-1.5 px-2 py-1">
              <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <Select value={i18n.language} onValueChange={changeDashboardLang}>
                <SelectTrigger className="h-7 bg-transparent border-border/50 text-[11px] flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/50">
                  <SelectItem value="fr">🇫🇷 FR</SelectItem>
                  <SelectItem value="pt">🇧🇷 PT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Collapse toggle - desktop only */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all w-full"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && <span>Recolher</span>}
          </button>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full"
          >
            <LogOut className={`w-4 h-4 ${collapsed ? 'mx-auto' : ''}`} />
            {!collapsed && <span>{t('dashboard.nav.logout')}</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 h-14 bg-background/90 backdrop-blur-md border-b border-border/50 flex items-center px-4 lg:px-6">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="lg:hidden mr-2 text-muted-foreground h-8 w-8">
            <Menu className="w-4 h-4" />
          </Button>
          <h1 className="text-sm font-medium text-foreground tracking-wide">
            {allNavItems.find((n) => isActive(n.path))?.label || 'Dashboard'}
          </h1>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
