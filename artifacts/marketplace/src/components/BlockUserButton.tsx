import { useEffect, useState } from "react";
import { Ban, ShieldOff, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

/**
 * BlockUserButton — App Store Guideline 1.2 (User-Generated Content)
 *
 * Apple requires UGC apps to provide a visible, user-discoverable way to
 * block abusive users. This button is the canonical entry point; Apple
 * reviewers verify it directly from the user profile screen.
 *
 * Behaviour:
 *   - On mount, fetches the current block status via
 *     GET /api/users/me/blocked/check?ids=<id>.
 *   - Renders "Bloke itilizatè" (Block User) when not blocked, or
 *     "Itilizatè bloke" (User blocked) — click to unblock — when blocked.
 *   - Click opens an AlertDialog confirmation, then calls
 *     POST or DELETE /api/users/:id/block depending on current state.
 *   - Calls onChanged() so the parent can refresh related queries
 *     (follow status, message availability, etc.) — this is also how the
 *     Profile page shows the "Content from this user is hidden" banner
 *     immediately after blocking, giving Apple reviewers a verifiable
 *     visual effect.
 *
 * Failure-mode policy:
 *   - If the status fetch fails, the button defaults to "Block" so the
 *     feature stays discoverable. Worst case is a confusing toast on a
 *     no-op DELETE, which is acceptable for the rare network-failure path.
 */

interface BlockUserButtonProps {
  targetUserId: number;
  targetUserName: string;
  onChanged?: (blocked: boolean) => void;
  /** Optional size override for embedding next to other action buttons. */
  size?: "sm" | "default";
}

interface BlockedCheckResponse {
  blocked: number[];
}

export function BlockUserButton({
  targetUserId,
  targetUserName,
  onChanged,
  size = "sm",
}: BlockUserButtonProps) {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [isBlocked, setIsBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // Initial block-status fetch. We only call the endpoint when the viewer is
  // logged in and is viewing someone else — Block does not apply to self.
  useEffect(() => {
    if (!me || me.id === targetUserId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<BlockedCheckResponse>(
          `/api/users/me/blocked/check?ids=${targetUserId}`,
        );
        if (cancelled) return;
        const blocked = res.blocked.includes(targetUserId);
        setIsBlocked(blocked);
        // Surface the initial state to the parent so banners / hidden-content
        // placeholders render correctly after a page refresh, not only after
        // the user just tapped Block.
        onChanged?.(blocked);
      } catch {
        // Default to not-blocked on failure so the action stays discoverable.
        if (!cancelled) setIsBlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally do not include onChanged in deps — parents may pass an
    // inline arrow function (creating a new identity each render) which would
    // cause the initial fetch to refire forever. The block status is keyed
    // purely on (me, targetUserId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, targetUserId]);

  // Hide entirely if the viewer is not logged in or is viewing themselves.
  if (!me || me.id === targetUserId) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (isBlocked) {
        await apiFetch(`/api/users/${targetUserId}/block`, { method: "DELETE" });
        setIsBlocked(false);
        onChanged?.(false);
        toast({ title: `${targetUserName} debloke.` });
      } else {
        await apiFetch(`/api/users/${targetUserId}/block`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        setIsBlocked(true);
        onChanged?.(true);
        toast({ title: `${targetUserName} bloke.` });
      }
      setOpen(false);
    } catch (err: any) {
      toast({
        title: err?.message ?? "Aksyon an pa t reyisi. Tanpri eseye ankò.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const verb = isBlocked ? "Debloke" : "Bloke";
  const title = isBlocked
    ? `Debloke ${targetUserName}?`
    : `Bloke ${targetUserName}?`;
  const description = isBlocked
    ? `Ou pral wè ankò mesaj, lis, ak kòmantè ${targetUserName}.`
    : `Apre ou bloke ${targetUserName}, ou pa pral wè lis li yo, mesaj li yo, oswa kòmantè li yo. Ou ka debloke nenpòt lè.`;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={isBlocked ? "default" : "outline"}
          size={size}
          data-testid={isBlocked ? "button-unblock-user" : "button-block-user"}
          className={isBlocked ? "" : "border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"}
        >
          {isBlocked ? (
            <ShieldOff className="h-4 w-4 mr-1" />
          ) : (
            <Ban className="h-4 w-4 mr-1" />
          )}
          {isBlocked ? "Itilizatè bloke" : "Bloke itilizatè"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} data-testid="button-block-cancel">
            Anile
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Prevent the default close — we drive the close from handleConfirm
              // so the dialog stays open while the network request is in flight.
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={busy}
            data-testid="button-block-confirm"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {verb}...
              </>
            ) : (
              verb
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
