import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useFlagContent } from "@/hooks/useApi";
import { toast } from "@/components/ui/use-toast";
import { FlagCreateRequest } from "@/types/api";
import { FLAG_REASON, FLAG_REASON_LABELS, CONTENT_TYPE } from "@/lib/constants";

interface ReportFlagDialogProps {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Build REASONS from constants
const REASONS = Object.entries(FLAG_REASON_LABELS).map(([value, label]) => ({
  value: value as keyof typeof FLAG_REASON,
  label,
}));

type ReasonValue = keyof typeof FLAG_REASON;

export default function ReportFlagDialog({
  videoId,
  open,
  onOpenChange,
}: ReportFlagDialogProps) {
  const flagMutation = useFlagContent();

  const [reasonCode, setReasonCode] = useState<ReasonValue | "">("");
  const [reasonText, setReasonText] = useState("");

  const submitting = flagMutation.isPending;

  const handleSubmit = async () => {
    if (!reasonCode) return;
    try {
      await flagMutation.mutateAsync({
        contentType: CONTENT_TYPE.VIDEO,
        contentId: videoId,
        reasonCode: reasonCode as FlagCreateRequest["reasonCode"],
        reasonText: reasonCode === FLAG_REASON.OTHER && reasonText ? reasonText : undefined,
      });
      toast({
        title: "Report submitted",
        description: "Thanks, your report was sent to the moderators.",
      });
      // Reset state & close
      setReasonCode("");
      setReasonText("");
      onOpenChange(false);
    } catch (err: unknown) {
      const apiError = err as { detail?: string };
      toast({
        title: "Could not submit report",
        description: apiError?.detail || "Please try again later.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this video</DialogTitle>
          <DialogDescription>
            Select a reason for reporting. Reports are confidential and help keep the
            community safe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup value={reasonCode} onValueChange={(val) => setReasonCode(val as ReasonValue)}>
            {REASONS.map((r) => (
              <div key={r.value} className="flex items-center space-x-2">
                <RadioGroupItem value={r.value} id={r.value} />
                <Label htmlFor={r.value} className="capitalize">
                  {r.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {reasonCode === FLAG_REASON.OTHER && (
            <div className="space-y-2">
              <Label htmlFor="reasonText">Additional details (optional)</Label>
              <Textarea
                id="reasonText"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                maxLength={500}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!reasonCode || submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 