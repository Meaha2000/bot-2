import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Bot, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>
      
      <Card className="w-full max-w-md shadow-2xl border-border/50 bg-card/80 backdrop-blur-xl z-10 transition-all duration-300 hover:shadow-primary/10 ring-1 ring-white/5">
        <CardHeader className="text-center pb-2 space-y-4">
          <div className="mx-auto w-20 h-20 bg-primary/5 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-primary/20 shadow-lg shadow-primary/5 group">
            <Bot className="text-primary w-10 h-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
          </div>
          <div className="space-y-2">
             <CardTitle className="text-2xl font-mono font-bold tracking-tight uppercase flex items-center justify-center gap-2">
                System Access
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
             </CardTitle>
             <CardDescription className="font-mono text-xs tracking-wide">Authentication required for neural interface.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-mono font-bold uppercase text-muted-foreground">Identity</Label>
              <div className="relative group">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <Input 
                  id="username" 
                  className="pl-9 font-mono text-sm bg-background/50 border-border/50 focus:border-primary/50 transition-all duration-200"
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder="admin"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-mono font-bold uppercase text-muted-foreground">Security Key</Label>
              <div className="relative group">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <Input 
                  id="password" 
                  type="password" 
                  className="pl-9 font-mono text-sm bg-background/50 border-border/50 focus:border-primary/50 transition-all duration-200"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-mono uppercase tracking-widest font-bold" disabled={loading}>
              {loading ? 'Authenticating...' : 'Initialize Session'}
            </Button>
            <div className="flex flex-col items-center gap-2 mt-6">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider opacity-50">
                Secure Environment v1.0.0
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
