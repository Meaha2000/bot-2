import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Shield, Trash2, Plus, UserCheck, Users, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

interface AdminUser {
  id: string;
  platform: string;
  platform_user_id: string;
  description: string;
  created_at: string;
}

interface DetectedUser {
  platform: string;
  sender_id: string;
  sender_name: string;
  last_seen: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [allUsers, setAllUsers] = useState<DetectedUser[]>([]);
  const [platform, setPlatform] = useState('');
  const [userId, setUserId] = useState('');
  const [desc, setDesc] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [adminsData, usersData] = await Promise.all([
        apiFetch('/api/admin/users'),
        apiFetch('/api/admin/all-users')
      ]);
      setAdmins(adminsData);
      setAllUsers(usersData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast.error('Failed to load data');
    }
  };

  const addAdmin = async (pPlatform: string, pUserId: string, pDesc: string = '') => {
    if (!pPlatform.trim() || !pUserId.trim()) return;
    setIsLoading(true);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          platform: pPlatform.trim(),
          platform_user_id: pUserId.trim(),
          description: pDesc.trim()
        })
      });
      // Clear manual input if it matches
      if (pPlatform === platform && pUserId === userId) {
        setPlatform('');
        setUserId('');
        setDesc('');
      }
      toast.success('Admin user added');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add admin');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAdmin = async (id: string) => {
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'DELETE'
      });
      toast.success('Admin removed');
      fetchData();
    } catch (e: any) {
      toast.error('Deletion failed');
    }
  };

  const isAdmin = (p: string, uid: string) => {
    return admins.find(a => a.platform === p && a.platform_user_id === uid);
  };

  // Group users by platform
  const usersByPlatform = allUsers.reduce((acc, u) => {
    if (!acc[u.platform]) acc[u.platform] = [];
    acc[u.platform].push(u);
    return acc;
  }, {} as Record<string, DetectedUser[]>);

  return (
    <div className="space-y-8 animate-fade-in p-6 pb-20">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-mono font-bold tracking-tight">Access Control</h1>
        <p className="text-muted-foreground font-mono text-sm">Manage platform-specific administrators and users.</p>
      </div>

      {/* Manual Add */}
      <Card className="border-border shadow-none bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Manually Grant Access
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4 items-end">
           <div className="space-y-1.5 flex-1 w-full">
             <label className="text-[10px] font-mono uppercase text-muted-foreground font-bold">Platform</label>
             <Input placeholder="e.g. telegram" value={platform} onChange={(e) => setPlatform(e.target.value)} className="font-mono text-xs" />
           </div>
           <div className="space-y-1.5 flex-1 w-full">
             <label className="text-[10px] font-mono uppercase text-muted-foreground font-bold">User ID</label>
             <Input placeholder="Platform User ID" value={userId} onChange={(e) => setUserId(e.target.value)} className="font-mono text-xs" />
           </div>
           <div className="space-y-1.5 flex-1 w-full">
             <label className="text-[10px] font-mono uppercase text-muted-foreground font-bold">Description</label>
             <Input placeholder="Optional note" value={desc} onChange={(e) => setDesc(e.target.value)} className="font-mono text-xs" />
           </div>
           <Button onClick={() => addAdmin(platform, userId, desc)} disabled={isLoading || !platform || !userId} className="font-mono uppercase tracking-widest text-xs h-10 min-w-[120px]">
             <Shield className="w-3.5 h-3.5 mr-2" />
             Grant
           </Button>
        </CardContent>
      </Card>

      {/* Section 1: Administrators */}
      <div className="space-y-4">
        <h2 className="text-lg font-mono font-bold uppercase tracking-widest text-primary flex items-center gap-2 border-b border-primary/20 pb-2">
          <Shield className="w-5 h-5" />
          Administrators
        </h2>
        
        {admins.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-lg bg-secondary/5">
             <Shield className="w-8 h-8 text-muted-foreground/50" />
             <p className="text-xs font-mono text-muted-foreground">No platform admins configured.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {admins.map((admin) => (
              <Card key={admin.id} className="border-primary/30 bg-primary/5 shadow-none overflow-hidden group hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                   <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center border border-primary/30">
                         <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div className="space-y-1 overflow-hidden">
                         <div className="flex items-center gap-2">
                            <h3 className="text-xs font-mono font-bold uppercase text-primary truncate">{admin.platform}</h3>
                            <Badge className="text-[9px] font-mono h-4 uppercase bg-yellow-500/20 text-yellow-600 border-yellow-500/50 hover:bg-yellow-500/30">
                               ADMIN
                            </Badge>
                         </div>
                         <p className="text-[10px] font-mono font-bold text-foreground/80 truncate">{admin.platform_user_id}</p>
                         {admin.description && <p className="text-[9px] font-mono text-muted-foreground truncate">{admin.description}</p>}
                      </div>
                   </div>
                   <Button variant="ghost" size="icon" onClick={() => deleteAdmin(admin.id)} className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                     <Trash2 className="w-3.5 h-3.5" />
                   </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Detected Users by Platform */}
      <div className="space-y-6">
        <h2 className="text-lg font-mono font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 border-b border-border pb-2">
          <Users className="w-5 h-5" />
          Detected Users
        </h2>

        {Object.keys(usersByPlatform).length === 0 && (
           <div className="h-32 flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-lg">
              <Users className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-xs font-mono text-muted-foreground">No users detected in chat logs yet.</p>
           </div>
        )}

        {Object.entries(usersByPlatform).map(([plat, users]) => (
          <div key={plat} className="space-y-3">
             <div className="flex items-center gap-2">
               <Badge variant="secondary" className="font-mono uppercase text-xs tracking-wider">{plat}</Badge>
               <span className="text-[10px] font-mono text-muted-foreground">{users.length} users</span>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {users.map((u) => {
                  const existingAdmin = isAdmin(u.platform, u.sender_id);
                  return (
                    <Card key={`${u.platform}-${u.sender_id}`} className={`border-border shadow-none transition-all ${existingAdmin ? 'opacity-75 bg-secondary/30' : 'bg-card hover:border-primary/20'}`}>
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                         <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-8 bg-secondary rounded flex items-center justify-center border border-border">
                               <UserCheck className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="space-y-0.5 overflow-hidden">
                               <div className="flex items-center gap-2">
                                  <p className="text-xs font-mono font-bold truncate max-w-[120px]">{u.sender_name || 'Unknown'}</p>
                                  {existingAdmin && (
                                    <Badge variant="outline" className="text-[8px] h-3 px-1 border-yellow-500/50 text-yellow-600 bg-yellow-500/10">ADMIN</Badge>
                                  )}
                               </div>
                               <p className="text-[9px] font-mono text-muted-foreground truncate">{u.sender_id}</p>
                               <p className="text-[8px] font-mono text-muted-foreground/60 truncate">Seen: {new Date(u.last_seen).toLocaleDateString()}</p>
                            </div>
                         </div>
                         
                         {existingAdmin ? (
                           <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => deleteAdmin(existingAdmin.id)}
                              className="h-7 px-2 text-[10px] font-mono text-red-500 hover:text-red-600 hover:bg-red-500/10"
                           >
                              Remove
                           </Button>
                         ) : (
                           <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => addAdmin(u.platform, u.sender_id, u.sender_name)}
                              className="h-7 px-2 text-[10px] font-mono hover:bg-primary hover:text-primary-foreground border-primary/20 text-primary"
                           >
                              <Plus className="w-3 h-3 mr-1" />
                              Add
                           </Button>
                         )}
                      </CardContent>
                    </Card>
                  );
                })}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
