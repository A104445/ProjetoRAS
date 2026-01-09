import { useState, useEffect } from "react";
import { useGetSocket } from "@/lib/queries/projects";
import { useToast } from "@/hooks/use-toast";

interface LockState {
  hasLock: boolean;        // Se EU tenho o lock
  isLocked: boolean;       // Se ALGUÉM (eu ou outro) tem o lock
  lockedBy: string | null; // ID de quem tem o lock
  lockedByName: string | null; // Nome de quem tem o lock
  queuePosition: number | null; // Minha posição na fila (se estiver à espera)
  estimatedWait: number | null; // Tempo de espera estimado
}

export function useProjectLock(projectId: string, isEditor: boolean, token: string) {
  const socket = useGetSocket(token);
  const { toast } = useToast();

  const [lockState, setLockState] = useState<LockState>({
    hasLock: false,
    isLocked: false,
    lockedBy: null,
    lockedByName: null,
    queuePosition: null,
    estimatedWait: null
  });

  useEffect(() => {
    if (!socket.data || !projectId) return;

    const s = socket.data;

    // 1. Entrar na sala do projeto
    s.emit("join-project", projectId);

    // 2. Ouvir eventos de Lock

    // Quando EU ganho o lock
    s.on("lock-acquired", () => {
      setLockState(prev => ({
        ...prev,
        hasLock: true,
        isLocked: true,
        queuePosition: null,
        lockedBy: "me",
        lockedByName: "Mim"
      }));
      toast({ title: "Modo de Edição", description: "Assumiu o controlo do projeto." });
    });

    // Quando entro na FILA
    s.on("lock-queued", (data: { position: number, estimatedWait?: number }) => {
      setLockState(prev => ({
        ...prev,
        hasLock: false,
        queuePosition: data.position,
        estimatedWait: data.estimatedWait || data.position * 5 * 60
      }));
      toast({ title: "Em Espera", description: `Posição na fila: ${data.position}` });
    });

    // Quando o pedido é negado (ex: alguém já tem)
    s.on("lock-denied", (data: { lockedBy: string, lockedByName?: string }) => {
        setLockState(prev => ({
            ...prev,
            hasLock: false,
            isLocked: true,
            lockedBy: data.lockedBy,
            lockedByName: data.lockedByName || "Outro utilizador"
        }));
    });

    // Quando OUTRA PESSOA ganha o lock (broadcast)
    s.on("project-locked", (data: { lockedBy: string, lockedByName: string }) => {
      setLockState(prev => {
        if (prev.hasLock) return prev; // Se sou eu, ignora
        return {
          ...prev,
          isLocked: true,
          hasLock: false,
          lockedBy: data.lockedBy,
          lockedByName: data.lockedByName
        };
      });
    });

    // Quando o projeto é LIBERTADO
    s.on("lock-released", () => {
       setLockState({
         hasLock: false,
         isLocked: false,
         lockedBy: null,
         lockedByName: null,
         queuePosition: null,
         estimatedWait: null
       });
    });

    // Atualização da fila
    s.on("lock-queue-position", (data: { position: number, estimatedWait?: number }) => {
       setLockState(prev => ({
           ...prev,
           queuePosition: data.position,
           estimatedWait: data.estimatedWait || prev.estimatedWait
        }));
    });

    // 3. Tentar adquirir lock inicial
    if (isEditor) {
      s.emit("request-lock", { projectId });
    } else {
      s.emit("check-lock", { projectId });
    }

    // Cleanup
    return () => {
      if (isEditor) {
        s.emit("release-lock", { projectId });
      }
      s.off("lock-acquired");
      s.off("lock-queued");
      s.off("lock-denied");
      s.off("project-locked");
      s.off("lock-released");
      s.off("lock-queue-position");
    };
  }, [socket.data, projectId, isEditor, toast]);

  return lockState;
}
