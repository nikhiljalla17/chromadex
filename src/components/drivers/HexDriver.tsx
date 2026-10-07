/**
 * The hex Driver: two-way hex input for the Current Color.
 *
 * Two-way, one store: the field renders the derived hex (`hexOf`) and writes
 * through `setFromHex`. While the user is editing, a local draft shows their
 * keystrokes verbatim (valid prefixes already update the Current Color live —
 * e.g. `aaf` is a valid 3-digit hex); on blur the draft clears and the field
 * resyncs to the canonical Current Color hex. Invalid input flags the field
 * and never changes the Current Color (the store's `setFromHex` is a no-op).
 */

import { useEffect, useRef, useState } from "react";

import { copyText } from "../../lib/clipboard";
import { hexToSrgb, srgbToHex } from "../../lib/color";
import { hexOf } from "../../state/current-color-store";
import { currentColorStore, useCurrentColor } from "../../state/store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function HexDriver() {
  const state = useCurrentColor();
  const canonical = hexOf(state);

  // Draft = the user's in-progress text; null means "render the canonical hex".
  const [draft, setDraft] = useState<string | null>(null);
  // Draft staleness (ticket 03 review): when the canonical hex changes from a
  // non-hex source — i.e. the last valid dispatch wasn't this field's — clear
  // the draft so the field resyncs instead of showing stale keystrokes.
  const lastDispatchedHex = useRef(canonical);
  useEffect(() => {
    if (draft !== null && canonical !== lastDispatchedHex.current) {
      setDraft(null);
    }
    lastDispatchedHex.current = canonical;
  }, [canonical]); // draft read intentionally; effect only fires on canonical change
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const value = draft ?? canonical;
  const invalid = draft !== null && hexToSrgb(draft) === null;

  function handleChange(next: string) {
    setDraft(next);
    const parsed = hexToSrgb(next);
    if (parsed) {
      currentColorStore.dispatch({ type: "setFromHex", hex: next });
      // Canonical after this dispatch — marks the change as ours so the
      // staleness effect keeps the draft.
      lastDispatchedHex.current = srgbToHex({ ...parsed, a: 1 });
    }
  }

  function handleBlur() {
    setDraft(null);
  }

  async function handleCopy() {
    const ok = await copyText(canonical);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
      data-testid="hex-driver"
    >
      <h2 className="text-xs font-medium text-muted-foreground">Hex</h2>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={handleBlur}
          aria-label="Hex value"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "hex-driver-error" : undefined}
          spellCheck={false}
          className="font-mono text-sm"
          data-testid="hex-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          aria-label="Copy hex value"
          data-testid="copy-hex"
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      {invalid && (
        <p
          className="text-xs text-destructive"
          data-testid="hex-error"
          id="hex-driver-error"
        >
          Not a valid hex color — the Current Color is unchanged
        </p>
      )}
    </div>
  );
}
