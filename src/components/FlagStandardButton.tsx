import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Flag, Loader2 } from "lucide-react";

interface Props {
  standardId: string;
  standardTitle: string;
}

export function FlagStandardButton({ standardId, standardTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("standard_flags").insert({
      standard_id: standardId,
      feedback: feedback.trim(),
      user_email: email.trim() || null,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Feedback submitted", description: "Thank you — our team will review your suggestion." });
      setOpen(false);
      setFeedback("");
      setEmail("");
    }
    setSubmitting(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <Flag className="h-3.5 w-3.5" />
        Report Issue
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag "{standardTitle}"</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Let us know if this standard's information is outdated or incorrect.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>What needs to change? *</Label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                placeholder="e.g. The status should be Approved — it was formally ratified in January 2026…"
                className="leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Your email (optional)</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <p className="text-[11px] text-muted-foreground">So we can follow up if needed.</p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting || !feedback.trim()}
              className="w-full"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting…</>
              ) : (
                "Submit Feedback"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
