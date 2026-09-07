import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, Users, BarChart3, Mic, Settings, BookOpen, CreditCard, Code,
  Building2, Search, Sun, Moon, Laptop, Star, Clock,
  ChevronRight, Sparkles, BookMarked,
  Activity, Shield, StarOff
} from 'lucide-react';
import { auth } from '../lib/auth';
import { useSessionStore } from '../store/useSessionStore';
import { useTheme } from './design-system/ThemeContext';
import { useToast, AtlasLogo } from './design-system';
import { getAccessibleTextOnBrand } from './design-system/tokens';
import { NotificationCenter } from './NotificationCenter';

export function Sidebar() {
  const location = useLocation();
  // Real session user (id/email/role/tenantId) from GET /api/auth/me, populated by
  // DashboardLayout on mount. No server route has ever set a `user_info` cookie, so reading one
  // here previously always resolved to a fabricated fallback name/email — see lib/auth.ts.
  const user = useSessionStore((state) => state.user);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  // `--brand-color` is tenant-controlled (Organization branding), so a hardcoded `text-white` on
  // `bg-brand` (theme toggle, avatar, active filter pill) can fail WCAG contrast for a light
  // tenant color — see components/design-system/tokens.ts for the contrast math.
  const brandColor = useSessionStore((state) => state.brandColor);
  const accessibleBrandText = getAccessibleTextOnBrand(brandColor);

  // Navigation state management for favorites and recents
  const [favorites, setFavorites] = useState<string[]>(['/dashboard', '/dashboard/agents/new']);
  const [recents, setRecents] = useState<string[]>([]);

  // Load favorites & recents on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.settings) {
          if (data.settings.favorites) {
            setFavorites(data.settings.favorites);
          }
          if (data.settings.recentRoutes) {
            setRecents(data.settings.recentRoutes);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Track recent pages when location changes
  useEffect(() => {
    const currentPath = location.pathname;
    if (currentPath && currentPath.startsWith('/dashboard')) {
      setRecents(prev => {
        const filtered = prev.filter(p => p !== currentPath);
        const updated = [currentPath, ...filtered].slice(0, 4);
        
        // PUT merges into the existing settings blob server-side; POST replaces it wholesale
        // and would silently wipe out favorites/theme/other keys saved by other calls.
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: { recentRoutes: updated } })
        }).catch(() => {});

        return updated;
      });
    }
  }, [location.pathname]);

  const toggleFavorite = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    let updated;
    if (favorites.includes(path)) {
      updated = favorites.filter(p => p !== path);
      showToast('Item removido dos favoritos', 'info');
    } else {
      updated = [...favorites, path];
      showToast('Item adicionado aos favoritos!', 'success');
    }
    setFavorites(updated);
    
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { favorites: updated } })
    }).catch(() => {});
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItemClass = (path: string) =>
    `flex items-center justify-between group/item p-2.5 rounded-lg transition-all text-xs font-semibold ${
      isActive(path)
        ? 'shadow-xs'
        : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
    }`;

  // `--brand-color` is tenant-controlled, so the active nav item's text color must be computed
  // (not hardcoded `text-white`) to keep >=4.5:1 contrast against whatever color a tenant picks —
  // see components/design-system/tokens.ts.
  const navItemStyle = (path: string) =>
    isActive(path) ? { backgroundColor: 'var(--brand-color)', color: accessibleBrandText } : {};

  const triggerSearch = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  const allNavItems = [
    { path: '/dashboard', label: 'Visão Geral', icon: <Home className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/agents', label: 'Agent Registry', icon: <Users className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/studio', label: 'Voice Studio', icon: <Sparkles className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/knowledge', label: 'Knowledge Base', icon: <BookMarked className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/tools', label: 'Tool Registry', icon: <Code className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/marketplace', label: 'Marketplace', icon: <Sparkles className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/observability', label: 'Observability', icon: <Activity className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/supervision', label: 'Live Supervisor', icon: <Activity className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/playground', label: 'Playground', icon: <BookOpen className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/telephony', label: 'Telefonia', icon: <Mic className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/results', label: 'Resultados', icon: <BarChart3 className="h-4 w-4" />, section: 'workspace' },
    { path: '/dashboard/analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" />, section: 'workspace' },
    
    { path: '/dashboard/organization', label: 'Organização', icon: <Building2 className="h-4 w-4" />, section: 'admin' },
    { path: '/dashboard/billing', label: 'Faturamento', icon: <CreditCard className="h-4 w-4" />, section: 'admin' },
    { path: '/dashboard/governance', label: 'Governança (RBAC)', icon: <Shield className="h-4 w-4" />, section: 'admin' },
    { path: '/dashboard/developers', label: 'Developers', icon: <Code className="h-4 w-4" />, section: 'admin' },
    { path: '/dashboard/docs', label: 'Docs & Tokens', icon: <BookOpen className="h-4 w-4" />, section: 'admin' },
    { path: '/dashboard/preferences', label: 'Preferências', icon: <Settings className="h-4 w-4" />, section: 'admin' }
  ];

  return (
    <div className="w-64 bg-slate-900 text-white h-screen flex flex-col p-4 shrink-0 overflow-y-auto border-r border-slate-850 relative select-none">
      
      {/* Brand Header */}
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <AtlasLogo className="h-6 w-6" />
          </div>
          <div className="text-left">
            <h1 className="text-base font-bold leading-none tracking-tight">Birth Hub 360</h1>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Voice Enterprise</span>
          </div>
        </div>

        <NotificationCenter />
      </div>

      {/* Enterprise Search Ctrl+K */}
      <button 
        onClick={triggerSearch}
        className="mb-4 flex items-center justify-between gap-2 px-3 py-2 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-lg text-xs transition-colors border border-slate-800 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5" />
          <span>Pesquisar...</span>
        </div>
        <kbd className="px-1.5 py-0.5 font-mono text-[9px] bg-slate-800 border border-slate-750 text-slate-400 rounded">
          Ctrl+K
        </kbd>
      </button>

      {/* SIDEBAR NAVIGATION SCROLL SECTION */}
      <div className="flex-1 space-y-5 overflow-y-auto pr-1 scrollbar-thin">
        
        {/* SECTION 1: FAVORITES (IF EXIST) */}
        {favorites.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              <span>Favoritos</span>
            </div>
            {favorites.map(favPath => {
              const matched = allNavItems.find(item => item.path === favPath);
              if (!matched) return null;
              return (
                <Link
                  key={favPath}
                  to={favPath}
                  className={navItemClass(favPath)} 
                  style={navItemStyle(favPath)}
                >
                  <div className="flex items-center gap-2.5">
                    {matched.icon}
                    <span>{matched.label}</span>
                  </div>
                  <button 
                    onClick={(e) => toggleFavorite(e, favPath)}
                    className="opacity-0 group-hover/item:opacity-100 text-slate-500 hover:text-red-400 transition-opacity p-0.5"
                  >
                    <StarOff className="h-3 w-3" />
                  </button>
                </Link>
              );
            })}
          </div>
        )}

        {/* SECTION 2: WORKSPACE */}
        <div className="space-y-1">
          <p className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Workspace</p>
          {allNavItems.filter(item => item.section === 'workspace').map(item => (
            <Link 
              key={item.path}
              to={item.path} 
              className={navItemClass(item.path)} 
              style={navItemStyle(item.path)}
            >
              <div className="flex items-center gap-2.5">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <button 
                onClick={(e) => toggleFavorite(e, item.path)}
                className={`opacity-0 group-hover/item:opacity-100 text-slate-500 hover:text-amber-400 transition-opacity p-0.5 ${favorites.includes(item.path) ? 'opacity-100 text-amber-500' : ''}`}
              >
                <Star className={`h-3 w-3 ${favorites.includes(item.path) ? 'fill-amber-500' : ''}`} />
              </button>
            </Link>
          ))}
        </div>

        {/* SECTION 3: ADMINISTRATIVO */}
        <div className="space-y-1">
          <p className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Administrativo</p>
          {allNavItems.filter(item => item.section === 'admin').map(item => (
            <Link 
              key={item.path}
              to={item.path} 
              className={navItemClass(item.path)} 
              style={navItemStyle(item.path)}
            >
              <div className="flex items-center gap-2.5">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <button 
                onClick={(e) => toggleFavorite(e, item.path)}
                className={`opacity-0 group-hover/item:opacity-100 text-slate-500 hover:text-amber-400 transition-opacity p-0.5 ${favorites.includes(item.path) ? 'opacity-100 text-amber-500' : ''}`}
              >
                <Star className={`h-3 w-3 ${favorites.includes(item.path) ? 'fill-amber-500' : ''}`} />
              </button>
            </Link>
          ))}
        </div>

        {/* SECTION 4: HISTÓRICO / RECENTES */}
        {recents.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-800/40">
            <div className="flex items-center gap-1.5 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <Clock className="h-3 w-3" />
              <span>Navegação Recente</span>
            </div>
            <div className="space-y-1 px-1">
              {recents.map(recentPath => {
                const matched = allNavItems.find(item => item.path === recentPath);
                if (!matched) return null;
                return (
                  <Link
                    key={recentPath}
                    to={recentPath}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] text-slate-400 hover:text-white hover:bg-slate-850 transition-colors"
                  >
                    <ChevronRight className="h-3 w-3" />
                    <span>{matched.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Theme selector widget */}
      <div className="py-2.5 px-2 mb-2 mt-4 bg-slate-850/40 rounded-lg border border-slate-800/65 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aparência</span>
        <div className="flex gap-1">
          <button
            onClick={() => setTheme('light')}
            style={theme === 'light' ? { backgroundColor: 'var(--brand-color, #ff5618)', color: accessibleBrandText } : undefined}
            className={`p-1.5 rounded transition-colors ${theme === 'light' ? '' : 'text-slate-500 hover:text-slate-350 hover:bg-slate-800/40'}`}
            title="Tema Claro"
            aria-label="Tema Claro"
            aria-pressed={theme === 'light'}
          >
            <Sun aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setTheme('dark')}
            style={theme === 'dark' ? { backgroundColor: 'var(--brand-color, #ff5618)', color: accessibleBrandText } : undefined}
            className={`p-1.5 rounded transition-colors ${theme === 'dark' ? '' : 'text-slate-500 hover:text-slate-350 hover:bg-slate-800/40'}`}
            title="Tema Escuro"
            aria-label="Tema Escuro"
            aria-pressed={theme === 'dark'}
          >
            <Moon aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setTheme('system')}
            style={theme === 'system' ? { backgroundColor: 'var(--brand-color, #ff5618)', color: accessibleBrandText } : undefined}
            className={`p-1.5 rounded transition-colors ${theme === 'system' ? '' : 'text-slate-500 hover:text-slate-350 hover:bg-slate-800/40'}`}
            title="Tema do Sistema"
            aria-label="Tema do Sistema"
            aria-pressed={theme === 'system'}
          >
            <Laptop aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* User profile & Workspace settings */}
      <div className="mt-auto pt-3 border-t border-slate-850">
        <div className="px-2 py-1">
          {sessionStatus === 'loading' && !user ? (
            <div className="flex items-center gap-2.5 text-left animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-800 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-2.5 w-24 rounded bg-slate-800" />
                <div className="h-2 w-32 rounded bg-slate-800" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-left">
              <div
                className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-sm font-bold shrink-0"
                style={{ color: accessibleBrandText }}
                aria-hidden="true"
              >
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="text-xs overflow-hidden">
                <p className="text-white font-bold truncate">{user?.email || 'Sessão não identificada'}</p>
                <p className="text-slate-500 truncate capitalize">{user?.role || '—'}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => auth.logout()}
            className="text-[10px] text-slate-500 hover:text-white mt-2 w-full text-left font-bold block"
          >
            Sair do Workspace
          </button>
        </div>
      </div>

    </div>
  );
}
