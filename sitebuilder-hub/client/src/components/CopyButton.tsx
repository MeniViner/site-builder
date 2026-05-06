import { Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      setDone(false);
    }
  };

  return (
    <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={copy}>
      <Copy size={12} /> {done ? "הועתק" : "העתק"}
    </button>
  );
}
