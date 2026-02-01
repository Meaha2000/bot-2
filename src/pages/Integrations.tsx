import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { 
  MessageCircle, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Settings2, 
  Copy,
  RefreshCw,
  Power,
  PowerOff,
  Bot,
  Smartphone
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

interface Integration {
  id: string;
  platform: 'telegram' | 'whatsapp' | 'messenger';
  name: string;
  api_key?: string;
  api_secret?: string;
  webhook_url?: string;
  phone_number?: string;
  bot_token?: string;
  page_id?: string;
  access_token?: string;
  status: 'active' | 'inactive' | 'error';
  status_verified_at?: string | null;
  connection_error?: string | null;
  proxy_url?: string;
  user_agent?: string;
  typing_delay_min: number;
  typing_delay_max: number;
  share_active_memory?: number;
  created_at: string;
}

const PLATFORM_ICONS = {
  telegram: <Bot className="w-5 h-5 text-blue-500" />,
  whatsapp: <Smartphone className="w-5 h-5 text-green-500" />,
  messenger: <MessageCircle className="w-5 h-5 text-purple-500" />,
};

const PLATFORM_COLORS = {
  telegram: 'border-blue-500/30 bg-blue-500/5',
  whatsapp: 'border-green-500/30 bg-green-500/5',
  messenger: 'border-purple-500/30 bg-purple-500/5',
};

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<'telegram' | 'whatsapp' | 'messenger'>('telegram');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    botToken: '',
    accessToken: '',
    phoneNumber: '',
    pageId: '',
    apiKey: '',
    apiSecret: '',
    webhookUrl: '',
    proxyUrl: '',
    typingDelayMin: 500,
    typingDelayMax: 2000,
    shareActiveMemory: false,
  });

  useEffect(() => {
    if (user) fetchIntegrations();
  }, [user]);

  const fetchIntegrations = async () => {
    try {
      const data = await apiFetch('/api/integrations');
      setIntegrations(data);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        platform: selectedPlatform,
        name: formData.name,
        botToken: formData.botToken || null,
        accessToken: formData.accessToken || null,
        phoneNumber: formData.phoneNumber || null,
        pageId: formData.pageId || null,
        apiKey: formData.apiKey || null,
        apiSecret: formData.apiSecret || null,
        webhookUrl: formData.webhookUrl || null,
        proxyUrl: formData.proxyUrl || null,
        typingDelayMin: formData.typingDelayMin,
        typingDelayMax: formData.typingDelayMax,
        shareActiveMemory: formData.shareActiveMemory,
      };

      if (editingIntegration) {
        await apiFetch(`/api/integrations/${editingIntegration.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('Integration updated');
      } else {
        await apiFetch('/api/integrations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Integration created');
      }
      
      resetForm();
      setDialogOpen(false);
      fetchIntegrations();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save integration');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleIntegration = async (id: string) => {
    try {
      const result = await apiFetch(`/api/integrations/${id}/toggle`, { method: 'POST' });
      toast.success(result.status === 'active' ? `Verified and activated` : 'Deactivated');
      fetchIntegrations();
    } catch (e: any) {
      const err = e?.error ?? e?.message ?? 'Failed to toggle';
      toast.error(err);
      fetchIntegrations();
    }
  };

  const verifyIntegration = async (id: string) => {
    try {
      const result = await apiFetch(`/api/integrations/${id}/verify`);
      toast.success(result.message || 'Connection verified');
      fetchIntegrations();
    } catch (e: any) {
      toast.error(e?.error ?? e?.message ?? 'Verification failed');
      fetchIntegrations();
    }
  };

  const deleteIntegration = async (id: string) => {
    if (!confirm('Are you sure you want to delete this integration?')) return;
    try {
      await apiFetch(`/api/integrations/${id}`, { method: 'DELETE' });
      toast.success('Integration deleted');
      fetchIntegrations();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete integration');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      botToken: '',
      accessToken: '',
      phoneNumber: '',
      pageId: '',
      apiKey: '',
      apiSecret: '',
      webhookUrl: '',
      proxyUrl: '',
      typingDelayMin: 500,
      typingDelayMax: 2000,
      shareActiveMemory: false,
    });
    setEditingIntegration(null);
  };

  const openEditDialog = (integration: Integration) => {
    setEditingIntegration(integration);
    setSelectedPlatform(integration.platform);
    setFormData({
      name: integration.name,
      botToken: integration.bot_token || '',
      accessToken: integration.access_token || '',
      phoneNumber: integration.phone_number || '',
      pageId: integration.page_id || '',
      apiKey: integration.api_key || '',
      apiSecret: integration.api_secret || '',
      webhookUrl: integration.webhook_url || '',
      proxyUrl: integration.proxy_url || '',
      typingDelayMin: integration.typing_delay_min,
      typingDelayMax: integration.typing_delay_max,
      shareActiveMemory: integration.share_active_memory === 1,
    });
    setDialogOpen(true);
  };

  const copyWebhookUrl = (integration: Integration) => {
    const baseUrl = window.location.origin;
    const webhookUrl = `${baseUrl}/api/webhooks/${integration.platform}/${integration.id}`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  };

  const getIntegrationsByPlatform = (platform: string) => 
    integrations.filter(i => i.platform === platform);

  const renderPlatformForm = () => {
    switch (selectedPlatform) {
      case 'telegram':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="botToken" className="font-mono text-xs">Bot Token *</Label>
              <Input
                id="botToken"
                placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                value={formData.botToken}
                onChange={(e) => setFormData(prev => ({ ...prev, botToken: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Get from @BotFather on Telegram</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhookUrl" className="font-mono text-xs">Webhook URL (Public) *</Label>
              <Input
                id="webhookUrl"
                placeholder="https://your-domain.com/api/webhooks/telegram/..."
                value={formData.webhookUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, webhookUrl: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Required for Telegram to send messages to your bot.</p>
            </div>
          </>
        );
      case 'whatsapp':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="font-mono text-xs">Phone Number ID *</Label>
              <Input
                id="phoneNumber"
                placeholder="15551234567"
                value={formData.phoneNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessToken" className="font-mono text-xs">Access Token *</Label>
              <Input
                id="accessToken"
                placeholder="EAABs..."
                value={formData.accessToken}
                onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">From Meta Business Suite</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiSecret" className="font-mono text-xs">App Secret (for signature verification)</Label>
              <Input
                id="apiSecret"
                type="password"
                placeholder="App Secret"
                value={formData.apiSecret}
                onChange={(e) => setFormData(prev => ({ ...prev, apiSecret: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="font-mono text-xs">Verify Token</Label>
              <Input
                id="apiKey"
                placeholder="random_string"
                value={formData.apiKey}
                onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Set this in the Meta Developer Portal (Webhooks section).</p>
            </div>
          </>
        );
      case 'messenger':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="pageId" className="font-mono text-xs">Page ID *</Label>
              <Input
                id="pageId"
                placeholder="123456789012345"
                value={formData.pageId}
                onChange={(e) => setFormData(prev => ({ ...prev, pageId: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessToken" className="font-mono text-xs">Page Access Token *</Label>
              <Input
                id="accessToken"
                placeholder="EAABs..."
                value={formData.accessToken}
                onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">From Meta Business Suite</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiSecret" className="font-mono text-xs">App Secret (for signature verification)</Label>
              <Input
                id="apiSecret"
                type="password"
                placeholder="App Secret"
                value={formData.apiSecret}
                onChange={(e) => setFormData(prev => ({ ...prev, apiSecret: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="font-mono text-xs">Verify Token</Label>
              <Input
                id="apiKey"
                placeholder="random_string"
                value={formData.apiKey}
                onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Set this in the Meta Developer Portal (Webhooks section).</p>
            </div>
          </>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-mono font-bold tracking-tight">Platform Integrations</h1>
          <p className="text-muted-foreground font-mono text-sm">Connect to Telegram, WhatsApp, and Facebook Messenger</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 font-mono">
              <Plus className="w-4 h-4" />
              Add Integration
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-mono">{editingIntegration ? 'Edit' : 'New'} Integration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!editingIntegration && (
                <Tabs value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as any)}>
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="telegram" className="font-mono text-xs gap-2">
                      {PLATFORM_ICONS.telegram} Telegram
                    </TabsTrigger>
                    <TabsTrigger value="whatsapp" className="font-mono text-xs gap-2">
                      {PLATFORM_ICONS.whatsapp} WhatsApp
                    </TabsTrigger>
                    <TabsTrigger value="messenger" className="font-mono text-xs gap-2">
                      {PLATFORM_ICONS.messenger} Messenger
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="name" className="font-mono text-xs">Instance Name *</Label>
                <Input
                  id="name"
                  placeholder="My Bot Instance"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="shareActiveMemory" className="font-mono text-xs">Share Active Memory</Label>
                  <Switch
                    id="shareActiveMemory"
                    checked={formData.shareActiveMemory}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, shareActiveMemory: checked }))}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Share active learning memories across all instances of this platform</p>
              </div>

              {renderPlatformForm()}

              <div className="border-t pt-4 space-y-4">
                <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">Anti-Detection Settings</p>
                
                <div className="space-y-2">
                  <Label htmlFor="proxyUrl" className="font-mono text-xs">Proxy URL (Optional)</Label>
                  <Input
                    id="proxyUrl"
                    placeholder="http://user:pass@proxy.example.com:8080"
                    value={formData.proxyUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, proxyUrl: e.target.value }))}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="typingDelayMin" className="font-mono text-xs">Min Typing Delay (ms)</Label>
                    <Input
                      id="typingDelayMin"
                      type="number"
                      value={formData.typingDelayMin}
                      onChange={(e) => setFormData(prev => ({ ...prev, typingDelayMin: parseInt(e.target.value) || 500 }))}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="typingDelayMax" className="font-mono text-xs">Max Typing Delay (ms)</Label>
                    <Input
                      id="typingDelayMax"
                      type="number"
                      value={formData.typingDelayMax}
                      onChange={(e) => setFormData(prev => ({ ...prev, typingDelayMax: parseInt(e.target.value) || 2000 }))}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="font-mono">Cancel</Button>
              <Button onClick={handleSubmit} disabled={isLoading} className="font-mono">
                {isLoading ? 'Saving...' : editingIntegration ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Platform Sections */}
      {(['telegram', 'whatsapp', 'messenger'] as const).map(platform => {
        const platformIntegrations = getIntegrationsByPlatform(platform);
        return (
          <Card key={platform} className={`border-border shadow-none bg-card overflow-hidden group hover:border-primary/20 transition-all ${PLATFORM_COLORS[platform]}`}>
            <CardHeader className="border-b border-border py-4 bg-secondary/30">
              <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-background border border-border">
                  {PLATFORM_ICONS[platform]}
                </div>
                {platform.charAt(0).toUpperCase() + platform.slice(1)} Instances
                <span className="text-muted-foreground ml-auto font-normal text-xs normal-case">
                  {platformIntegrations.length} configured
                </span>
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/10">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider pl-4">Instance Name</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Connection Status</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Webhook Endpoint</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Created</TableHead>
                    <TableHead className="w-[150px] text-right pr-4 font-mono text-[10px] uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {platformIntegrations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center font-mono text-xs text-muted-foreground">
                        No {platform} integrations configured. Click "Add Integration" to start.
                      </TableCell>
                    </TableRow>
                  )}
                  {platformIntegrations.map((integration) => (
                    <TableRow key={integration.id} className="font-mono text-xs border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <TableCell className="font-medium pl-4">
                        <span className="font-bold text-foreground/80">{integration.name}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full w-fit border ${
                            integration.status === 'active' 
                              ? 'bg-green-500/10 text-green-600 border-green-500/20' 
                              : integration.status === 'error'
                              ? 'bg-red-500/10 text-red-600 border-red-500/20'
                              : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                          }`}>
                            {integration.status === 'active' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : integration.status === 'error' ? (
                              <AlertCircle className="w-3 h-3" />
                            ) : (
                              <Power className="w-3 h-3" />
                            )}
                            <span className="capitalize text-[10px] font-bold">{integration.status}</span>
                          </div>
                          {integration.connection_error && (
                            <span className="text-[9px] text-red-500 max-w-[200px] truncate pl-1" title={integration.connection_error}>
                              Error: {integration.connection_error}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 font-mono text-[10px] gap-2 bg-background/50 hover:bg-background"
                          onClick={() => copyWebhookUrl(integration)}
                        >
                          <Copy className="w-3 h-3" />
                          Copy Endpoint
                        </Button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(integration.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex justify-end gap-1">
                          {integration.status !== 'active' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-green-500/10 hover:text-green-600"
                              onClick={() => verifyIntegration(integration.id)}
                              title="Verify connection"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${integration.status === 'active' ? 'hover:bg-yellow-500/10 hover:text-yellow-600' : 'hover:bg-green-500/10 hover:text-green-600'}`}
                            onClick={() => toggleIntegration(integration.id)}
                            title={integration.status === 'active' ? 'Deactivate' : 'Activate (verifies connection)'}
                          >
                            {integration.status === 'active' ? (
                              <PowerOff className="w-3.5 h-3.5" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-blue-500/10 hover:text-blue-600"
                            onClick={() => openEditDialog(integration)}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => deleteIntegration(integration.id)}
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
        );
      })}

      {/* Setup Instructions */}
      <Card className="border-border shadow-none bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider">Setup Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 font-mono text-xs">
          <div className="space-y-2">
            <h4 className="font-bold flex items-center gap-2">{PLATFORM_ICONS.telegram} Telegram</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Create a bot via @BotFather on Telegram</li>
              <li>Copy the Bot Token provided</li>
              <li>Add the integration here with the token</li>
              <li>Set the webhook URL in BotFather or via API</li>
            </ol>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold flex items-center gap-2">{PLATFORM_ICONS.whatsapp} WhatsApp Business</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Create a Meta Business App at developers.facebook.com</li>
              <li>Add WhatsApp product and get Phone Number ID</li>
              <li>Generate a permanent Access Token</li>
              <li>Configure webhook URL in the Meta dashboard</li>
            </ol>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold flex items-center gap-2">{PLATFORM_ICONS.messenger} Facebook Messenger</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Create a Meta Business App</li>
              <li>Add Messenger product and link to a Facebook Page</li>
              <li>Generate Page Access Token</li>
              <li>Configure webhook URL and subscribe to messages</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
