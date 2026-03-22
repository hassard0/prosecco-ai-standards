import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

export function AdminInvite() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    const { data, error } = await supabase.rpc("grant_admin_by_email", {
      _email: email.trim(),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data && typeof data === "object" && "success" in data) {
      const result = data as { success: boolean; error?: string };
      if (result.success) {
        toast({ title: "Admin added", description: `${email} is now an admin.` });
        setEmail("");
      } else {
        toast({ title: "Could not add admin", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleInvite} className="flex items-end gap-2">
      <div className="flex-1">
        <Input
          type="email"
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-9"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={loading}>
        <UserPlus className="h-4 w-4 mr-1" />
        {loading ? "Inviting…" : "Invite Admin"}
      </Button>
    </form>
  );
}
