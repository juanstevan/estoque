"use client";

import { useState } from "react";
import { Download } from "lucide-react";

/** Cross-origin <a download> ignores the name, so fetch the file and save it under ours. */
export function DownloadPhoto({ url, fileName }: { url: string; fileName: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Download ${fileName}`}
      className="flex size-7 items-center justify-center rounded-md bg-surface/90 text-gray-700 shadow-xs backdrop-blur transition-colors hover:bg-surface hover:text-gray-900 disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error();
          const href = URL.createObjectURL(await res.blob());
          const a = document.createElement("a");
          a.href = href;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(href), 1000);
        } catch {
          window.open(url, "_blank", "noopener");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="size-3.5" />
    </button>
  );
}
