import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MessageSquare, 
  UserCircle, 
  Settings, 
  History, 
  Brain, 
  LogOut,
  Network,
  Moon,
  Sun,
  Database,
  Shield,
  HardDrive,
  Menu
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: MessageSquare, label: 'Playground', path: '/playground' },
  { icon: Network, label: 'Integrations', path: '/integrations' },
  { icon: HardDrive, label: 'File Storage', path: '/files' },
  { icon: UserCircle, label: 'Personalities', path: '/personalities' },
  { icon: Database, label: 'Memory Bank', path: '/memory' },
  { icon: Brain, label: 'Tools', path: '/tools' },
  { icon: Shield, label: 'Access', path: '/admin' },
  { icon: History, label: 'Logs', path: '/logs' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { logout, user } = useAuth();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check system preference and stored preference
    const isDark = document.documentElement.classList.contains('dark') || 
      localStorage.getItem('darkMode') === 'true';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
    
    // Load user settings
    if (user) {
      apiFetch('/api/settings/user').then(settings => {
        if (settings.darkMode !== undefined) {
          setDarkMode(settings.darkMode);
          if (settings.darkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      }).catch(() => {});
    }
  }, [user]);

  const toggleDarkMode = async () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Save to backend
    try {
      await apiFetch('/api/settings/user', {
        method: 'PUT',
        body: JSON.stringify({ darkMode: newMode }),
      });
    } catch (e) {
      console.error('Failed to save dark mode setting:', e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <span className="text-primary-foreground font-mono font-bold">G</span>
          </div>
          <span className="font-mono font-bold text-lg tracking-tight">GEMINI BOT</span>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-mono text-sm",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md transition-colors font-mono text-sm text-red-500 hover:bg-red-500/10"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </nav>
      <div className="p-4 border-t border-border space-y-3">
        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            {darkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            <span>{darkMode ? 'Dark' : 'Light'} Mode</span>
          </div>
          <Switch
            checked={darkMode}
            onCheckedChange={toggleDarkMode}
            className="scale-75"
          />
        </div>
        {/* Status Indicator */}
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Status</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-mono font-medium">Node Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn("w-64 border-r border-border bg-card flex flex-col h-screen sticky top-0", className)}>
      <SidebarContent />
    </aside>
  );
}

export function MobileNav({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("h-16 border-b bg-card flex items-center px-4 justify-between", className)}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
           <span className="text-primary-foreground font-mono font-bold">G</span>
        </div>
        <span className="font-mono font-bold text-lg tracking-tight">GEMINI BOT</span>
      </div>
      
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72">
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
