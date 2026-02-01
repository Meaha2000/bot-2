import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Key, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw, Moon, Zap, Shield, Brain, Globe, Cloud, Calculator as CalculatorIcon, FileText, Github, 
  Coins,
  Wrench,
  Archive
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

interface GeminiKey {
  id: string;
  key: string;
  status: string;
  last_used_at: string;
  best_model?: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<GeminiKey[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState({
    darkMode: false,
    typingSimulation: true,
    antiDetection: true,
    preferredModel: 'auto',
    temperature: 0.7,
    maxOutputTokens: 2048,
    enableWebSearch: true,
    enableWeather: true,
    enableCalculator: true,
    enableScraper: true,
    enableGithub: true,
    enableCurrency: true
  });

  useEffect(() => {
    if (user) {
      fetchKeys();
      fetchSettings();
      fetchAvailableModels();
    }
  }, [user]);

  const fetchAvailableModels = async () => {
    try {
      const data = await apiFetch('/api/models');
      setAvailableModels(data);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiFetch('/api/settings/user');
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const updateSetting = async (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      await apiFetch('/api/settings/user', {
        method: 'PUT',
        body: JSON.stringify(newSettings)
      });
      if (key === 'darkMode') {
        if (newSettings.darkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
      }
      toast.success('Settings updated');
    } catch (e) {
      toast.error('Failed to save settings');
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    updateSetting(key, !settings[key]);
  };

  const fetchKeys = async () => {
    try {
      const data = await apiFetch('/api/keys');
      setKeys(data);
    } catch (err) {
      console.error('Failed to fetch keys:', err);
    }
  };

  const addKey = async () => {
    if (!newKey.trim() || !user) return;
    setIsLoading(true);
    try {
      await apiFetch('/api/keys', {
        method: 'POST',
        body: JSON.stringify({ key: newKey.trim() })
      });
      setNewKey('');
      toast.success('API Key added to pool');
      fetchKeys();
      fetchAvailableModels(); // Refresh models too
    } catch (e: any) {
      toast.error(e.message || 'Failed to add key');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteKey = async (id: string) => {
    try {
      await apiFetch(`/api/keys/${id}`, {
        method: 'DELETE'
      });
      toast.success('Key removed');
      fetchKeys();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete key');
    }
  };

  const backupMemories = async () => {
    try {
      const result = await apiFetch('/api/settings/backup-memories', { method: 'POST' });
      toast.success(result.message);
    } catch (e: any) {
      toast.error(e.message || 'Backup failed');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-mono font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground font-mono text-sm">Global configuration for the bot behavior.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-none bg-card transition-all duration-200 hover:scale-[1.02] hover:border-primary/20 group">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono font-bold uppercase flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
              <Moon className="w-4 h-4" /> Dark Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-center justify-between">
                <Label htmlFor="dark-mode" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Toggle UI theme</Label>
                <Switch id="dark-mode" checked={settings.darkMode} onCheckedChange={() => toggleSetting('darkMode')} />
             </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none bg-card transition-all duration-200 hover:scale-[1.02] hover:border-primary/20 group">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono font-bold uppercase flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
              <Zap className="w-4 h-4" /> Typing Simulation
            </CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-center justify-between">
                <Label htmlFor="typing" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Human-like delays</Label>
                <Switch id="typing" checked={settings.typingSimulation} onCheckedChange={() => toggleSetting('typingSimulation')} />
             </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none bg-card transition-all duration-200 hover:scale-[1.02] hover:border-primary/20 group">
           <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono font-bold uppercase flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
              <Shield className="w-4 h-4" /> Anti-Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-center justify-between">
                <Label htmlFor="anti-detect" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Stealth patterns</Label>
                <Switch id="anti-detect" checked={settings.antiDetection} onCheckedChange={() => toggleSetting('antiDetection')} />
             </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none bg-card transition-all duration-200 hover:scale-[1.02] hover:border-primary/20 group">
           <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono font-bold uppercase flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
              <Brain className="w-4 h-4" /> Model Preference
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex flex-col gap-2">
                <Label htmlFor="model-pref" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Global Selection</Label>
                <Select 
                  value={settings.preferredModel || 'auto'} 
                  onValueChange={(val) => updateSetting('preferredModel', val)}
                >
                  <SelectTrigger className="h-8 text-xs font-mono">
                    <SelectValue placeholder="Auto (Best Available)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="font-mono text-xs">Auto (Best Available)</SelectItem>
                    {availableModels.map(m => (
                      <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
             </div>

             <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Temp: {settings.temperature ?? 0.7}</Label>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.temperature ?? 0.7}
                  onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
                  className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                />
             </div>

             <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Max Tokens</Label>
                <Input
                  type="number"
                  value={settings.maxOutputTokens ?? 2048}
                  onChange={(e) => updateSetting('maxOutputTokens', parseInt(e.target.value))}
                  className="h-7 font-mono text-[10px]"
                />
             </div>
          </CardContent>
        </Card>

        {/* Tool Settings */}
        <Card className="border-border shadow-none bg-card transition-all duration-200 hover:scale-[1.02] hover:border-primary/20 group">
           <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono font-bold uppercase flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
              <Wrench className="w-4 h-4" /> Active Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-center justify-between">
                <Label htmlFor="web-search" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-3 h-3" /> Web Search
                </Label>
                <Switch id="web-search" checked={settings.enableWebSearch} onCheckedChange={() => toggleSetting('enableWebSearch')} />
             </div>
             <div className="flex items-center justify-between">
                <Label htmlFor="weather" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-2">
                  <Cloud className="w-3 h-3" /> Weather
                </Label>
                <Switch id="weather" checked={settings.enableWeather} onCheckedChange={() => toggleSetting('enableWeather')} />
             </div>
             <div className="flex items-center justify-between">
                <Label htmlFor="calc" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-2">
                  <CalculatorIcon className="w-3 h-3" /> Calculator
                </Label>
                <Switch id="calc" checked={settings.enableCalculator} onCheckedChange={() => toggleSetting('enableCalculator')} />
             </div>
             <div className="flex items-center justify-between">
                <Label htmlFor="scraper" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-3 h-3" /> Web Scraper
                </Label>
                <Switch id="scraper" checked={settings.enableScraper} onCheckedChange={() => toggleSetting('enableScraper')} />
             </div>
             <div className="flex items-center justify-between">
                <Label htmlFor="github" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-2">
                  <Github className="w-3 h-3" /> GitHub Repo
                </Label>
                <Switch id="github" checked={settings.enableGithub} onCheckedChange={() => toggleSetting('enableGithub')} />
             </div>
             <div className="flex items-center justify-between">
                <Label htmlFor="currency" className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-2">
                  <Coins className="w-3 h-3" /> Currency
                </Label>
                <Switch id="currency" checked={settings.enableCurrency} onCheckedChange={() => toggleSetting('enableCurrency')} />
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-mono font-bold tracking-tight">API Management</h1>
        <p className="text-muted-foreground font-mono text-sm">Configure your Google Gemini API key pool for round-robin rotation.</p>
      </div>

      <Card className="border-border shadow-none bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add New Credential
          </CardTitle>
          <CardDescription className="font-mono text-xs">Enter a valid Google Gemini API Key. It will be added to the active rotation pool.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="AIzaSy..."
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="font-mono text-sm"
              disabled={isLoading}
            />
            <Button onClick={addKey} disabled={isLoading || !newKey} className="gap-2 font-mono h-10">
              <Key className="w-4 h-4" />
              Register Key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none overflow-hidden bg-card">
        <CardHeader className="bg-secondary/30 border-b border-border">
          <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
            <Key className="w-4 h-4" /> Active Key Pool
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/10">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Credential ID</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Secret (Masked)</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Best Model</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Status</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Last Transmission</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center font-mono text-xs text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                       <Key className="w-8 h-8 opacity-20" />
                       <p>No API keys registered. The system is currently offline.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {keys.map((k) => (
                <TableRow key={k.id} className="font-mono text-xs border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <TableCell className="font-medium truncate max-w-[100px] text-muted-foreground">{k.id}</TableCell>
                  <TableCell className="font-mono">{k.key.substring(0, 8)}••••••••••••</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-500 ring-1 ring-inset ring-blue-500/20">
                      {k.best_model || 'Detecting...'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                      k.status === 'active' 
                        ? 'bg-green-500/10 text-green-600 border-green-500/20' 
                        : 'bg-red-500/10 text-red-600 border-red-500/20'
                    }`}>
                      {k.status === 'active' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      <span className="capitalize text-[10px] font-bold">{k.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                       <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary">
                         <RefreshCw className="w-3.5 h-3.5" />
                       </Button>
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                         onClick={() => deleteKey(k.id)}
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="bg-destructive/5 border-destructive/20 shadow-none">
        <CardHeader>
          <CardTitle className="font-mono text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-background/50">
            <div>
              <h3 className="font-mono font-bold text-xs text-destructive uppercase tracking-wider">Clear Chat History</h3>
              <p className="text-[10px] text-muted-foreground font-mono mt-1">Permanently remove all chat sessions and messages.</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => {
                if (confirm('Are you sure? This cannot be undone.')) {
                   apiFetch('/api/playground/history', { method: 'DELETE' })
                     .then(() => toast.success('Chat history cleared'))
                     .catch(() => toast.error('Failed to clear history'));
                }
            }} className="font-mono h-8 text-xs">
              Delete All
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Data Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-secondary/10">
            <div>
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider">Backup Memories</h3>
              <p className="text-[10px] text-muted-foreground font-mono mt-1">Export all user memories to a JSON file on the server.</p>
            </div>
            <Button variant="outline" size="sm" onClick={backupMemories} className="font-mono h-8 text-xs gap-2">
              <Archive className="w-3 h-3" />
              Create Backup
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
