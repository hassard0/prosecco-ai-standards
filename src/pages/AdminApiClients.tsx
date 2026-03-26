import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientManager } from "@/components/ApiClientManager";

export default function AdminApiClients() {
  const { user, hasTeamAccess, loading, signOut } = useAuth();

  if (loading) return null;
  if (!user || !hasTeamAccess) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold text-foreground">API Clients</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{user.email}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
        <ApiClientManager />
      </main>
    </div>
  );
}
