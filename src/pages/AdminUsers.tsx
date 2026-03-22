import { useState, useEffect } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, Trash2, Shield } from "lucide-react";
import { AdminInvite } from "@/components/AdminInvite";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  user_id: string;
  email: string;
  role: string;
}

export default function AdminUsers() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const { toast } = useToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchAdmins = async () => {
    setLoadingAdmins(true);
    const { data, error } = await supabase.rpc("list_admins");
    if (!error && data) setAdmins(data as AdminUser[]);
    setLoadingAdmins(false);
  };

  useEffect(() => {
    if (isAdmin) fetchAdmins();
  }, [isAdmin]);

  const handleRemove = async (targetId: string, email: string) => {
    if (targetId === user?.id) {
      toast({ title: "Can't remove yourself", variant: "destructive" });
      return;
    }
    setRemovingId(targetId);
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", targetId)
      .eq("role", "admin");

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Removed ${email} as admin` });
      setAdmins((prev) => prev.filter((a) => a.user_id !== targetId));
    }
    setRemovingId(null);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold text-foreground text-sm">Team Management</h1>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Current Admins */}
        <section className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Current Admins</h2>
            <p className="text-sm text-muted-foreground mt-1">Users with admin access to the standards board.</p>
          </div>

          {loadingAdmins ? (
            <div className="space-y-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admins found.</p>
          ) : (
            <div className="space-y-1">
              {admins.map((admin) => {
                const isSelf = admin.user_id === user.id;
                return (
                  <div
                    key={admin.user_id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Shield className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {admin.email}
                          {isSelf && <span className="text-xs text-muted-foreground ml-2">(you)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{admin.role}</p>
                      </div>
                    </div>
                    {!isSelf && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={removingId === admin.user_id}
                        onClick={() => handleRemove(admin.user_id, admin.email)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {removingId === admin.user_id ? "Removing…" : "Remove"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Invite */}
        <section className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Invite Admins</h2>
            <p className="text-sm text-muted-foreground mt-1">Grant admin access to existing users or send an invite to new ones.</p>
          </div>
          <AdminInvite onInvited={fetchAdmins} />
        </section>
      </main>
    </div>
  );
}
