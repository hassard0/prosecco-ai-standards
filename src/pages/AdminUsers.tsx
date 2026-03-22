import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { AdminInvite } from "@/components/AdminInvite";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminUsers() {
  const { user, isAdmin, loading, signOut } = useAuth();

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
        <section className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Invite Admins</h2>
            <p className="text-sm text-muted-foreground mt-1">Grant admin access to existing users or send an invite to new ones.</p>
          </div>
          <AdminInvite />
        </section>
      </main>
    </div>
  );
}
