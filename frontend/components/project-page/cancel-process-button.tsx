"use client";

import { useState, useEffect } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CancelProcessButton({ isProcessing, onCancel }: { isProcessing: boolean, onCancel: () => void }) {
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isProcessing) {
      // REQUISITO T-10: Icon aparece após 10s (10000ms)
      // 10ms para efeitos de teste
      timer = setTimeout(() => setShowCancel(true), 10000);
    } else {
      setShowCancel(false);
    }
    return () => clearTimeout(timer);
  }, [isProcessing]);

  if (!isProcessing || !showCancel) return null;

  return (
    <Button variant="destructive" size="sm" onClick={onCancel} className="flex gap-2">
      <XCircle size={16} /> Cancelar
    </Button>
  );
}