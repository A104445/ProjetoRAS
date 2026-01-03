"use client";

import { Download, LoaderCircle, OctagonAlert, Play, RotateCcw } from "lucide-react";
import { ProjectImageList } from "@/components/project-page/project-image-list";
import { ViewToggle } from "@/components/project-page/view-toggle";
import { AddImagesDialog } from "@/components/project-page/add-images-dialog";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/toolbar/toolbar";
import {
  useGetProject,
  useGetProjectResults,
  useGetSocket,
} from "@/lib/queries/projects";
import Loading from "@/components/loading";
import { ProjectProvider } from "@/providers/project-provider";
import { use, useEffect, useLayoutEffect, useState, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSession } from "@/providers/session-provider";
import {
  useClearProjectTools,
  useDownloadProject,
  useDownloadProjectResults,
  useProcessProject,
  useCancelProjectProcess, // cancel hook
} from "@/lib/mutations/projects";
import { useToast } from "@/hooks/use-toast";
import { ProjectImage } from "@/lib/projects";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Transition } from "@headlessui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ModeToggle } from "@/components/project-page/mode-toggle";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { CancelProcessButton } from "@/components/project-page/cancel-process-button";
import { ShareButton } from "@/components/project-page/share-button";
import { ShareDashboard } from "@/components/project-page/share-dashboard";

export default function Project({ params }: { params: Promise<{ pid: string }> }) {
  const resolvedParams = use(params);
  const session = useSession();
  const { pid } = resolvedParams;

  const project = useGetProject(session.user._id, pid, session.token);
  const downloadProjectImages = useDownloadProject();
  const processProject = useProcessProject();
  const downloadProjectResults = useDownloadProjectResults();
  const clearTools = useClearProjectTools(session.user._id, pid, session.token);
  const cancelProcess = useCancelProjectProcess(session.user._id, pid, session.token); // cancel hook

  const { toast } = useToast();
  const socket = useGetSocket(session.token);
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "grid";
  const mode = searchParams.get("mode") ?? "edit";
  const router = useRouter();
  const path = usePathname();
  const sidebar = useSidebar();
  const isMobile = useIsMobile();

  const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingSteps, setProcessingSteps] = useState<number>(1);
  const [waitingForPreview, setWaitingForPreview] = useState<string>("");

  const totalProcessingSteps =
    (project.data?.tools.length ?? 0) * (project.data?.imgs.length ?? 0);
  const projectResults = useGetProjectResults(session.user._id, pid, session.token);
  const qc = useQueryClient();

  // Lock state
  const [lockState, setLockState] = useState({
    isLocked: false,
    lockedBy: null as string | null,
    hasLock: false,
    expiresAt: null as number | null,
  });

  // Cancel handler
  const handleCancel = () => {
    cancelProcess.mutate(undefined, {
      onSuccess: () => {
        setProcessing(false);
        setProcessingProgress(0);
        setProcessingSteps(1);
        if (!isMobile) sidebar.setOpen(true);
        toast({
          title: "Processamento cancelado",
          description: "A operação foi interrompida e o projeto desbloqueado.",
        });
      },
      onError: (error: any) => {
        toast({
          title: "Erro ao cancelar",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  // Redirect invalid modes/views
  useLayoutEffect(() => {
    if (!["edit", "results"].includes(mode) || !["grid", "carousel"].includes(view)) {
      router.replace(path);
    }
  }, [mode, view, path, router, projectResults.data]);

  // Force re-render for countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Debugging references
  const prevSocketData = useRef(socket.data);
  const prevPid = useRef(pid);
  const joinedRef = useRef(false);

  // Socket: join project room
  useEffect(() => {
    if (!socket.data || !pid) return;

    if (socket.data !== prevSocketData.current) prevSocketData.current = socket.data;
    if (pid !== prevPid.current) prevPid.current = pid;

    if (!joinedRef.current) {
      socket.data.emit("join-project", pid);
      joinedRef.current = true;
    }

    socket.data.off("project-updated");
    socket.data.on("project-updated", ({ projectId, updateType }: { projectId: string; updateType: string }) => {
      if (projectId === pid) {
        qc.refetchQueries({ queryKey: ["project", session.user._id, pid] });
        qc.refetchQueries({ queryKey: ["results", session.user._id, pid] });
      }
    });

    return () => {
      if (socket.data) {
        socket.data.emit("leave-project", pid);
        socket.data.off("project-updated");
        joinedRef.current = false;
      }
    };
  }, [socket.data, pid]);

  // Lock management
  useEffect(() => {
    if (!socket.data || !pid || !joinedRef.current) return;

    socket.data.off("lock-acquired");
    socket.data.off("lock-queued");
    socket.data.off("lock-denied");
    socket.data.off("project-locked");
    socket.data.off("lock-released");
    socket.data.off("lock-extended");

    socket.data.emit("request-lock", { projectId: pid });

    socket.data.on("lock-acquired", () => {
      setLockState({ isLocked: true, lockedBy: session.user._id, hasLock: true, expiresAt: Date.now() + 60 * 1000 });
    });
    socket.data.on("lock-queued", ({ position }: { position: number }) => {
      setLockState({ isLocked: true, lockedBy: null, hasLock: false, expiresAt: null });
      toast({ title: "Waiting for edit access", description: `You are #${position} in line.` });
    });
    socket.data.on("lock-denied", ({ lockedBy }: { lockedBy: string }) => {
      setLockState({ isLocked: true, lockedBy, hasLock: false, expiresAt: null });
      toast({ title: "View-only mode", description: "Another user is currently editing." });
    });
    socket.data.on("project-locked", ({ lockedBy }: { lockedBy: string }) => {
      setLockState(prev => (!prev.hasLock ? { isLocked: true, lockedBy, hasLock: false, expiresAt: null } : prev));
    });
    socket.data.on("lock-released", () => {
      setLockState({ isLocked: false, lockedBy: null, hasLock: false, expiresAt: null });
    });
    socket.data.on("lock-extended", () => {
      setLockState(prev => ({ ...prev, expiresAt: Date.now() + 60 * 1000 }));
    });

    return () => {
      if (socket.data) socket.data.emit("release-lock", { projectId: pid });
      socket.data.off("lock-acquired");
      socket.data.off("lock-queued");
      socket.data.off("lock-denied");
      socket.data.off("project-locked");
      socket.data.off("lock-released");
      socket.data.off("lock-extended");
    };
  }, [socket.data, pid]);

  // Lock expiration timer
  useEffect(() => {
    if (!lockState.hasLock || !lockState.expiresAt) return;
    const interval = setInterval(() => {
      if (lockState.expiresAt && Date.now() >= lockState.expiresAt) {
        setLockState({ isLocked: false, lockedBy: null, hasLock: false, expiresAt: null });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockState.hasLock, lockState.expiresAt]);

  // Helper: broadcast updates
  const broadcastProjectUpdate = (updateType: string) => {
    if (socket.data && pid) socket.data.emit("project-updated", { projectId: pid, updateType });
  };

  // Processing progress
  useEffect(() => {
    function onProcessUpdate() {
      setProcessingSteps(prev => prev + 1);
      const progress = Math.min(Math.round((processingSteps * 100) / totalProcessingSteps), 100);
      setProcessingProgress(progress);

      if (processingSteps >= totalProcessingSteps) {
        setTimeout(() => {
          projectResults.refetch().then(() => {
            setProcessing(false);
            if (!isMobile) sidebar.setOpen(true);
            setProcessingProgress(0);
            setProcessingSteps(1);
            router.push("?mode=results&view=grid");
          });
        }, 2000);
      }
    }

    let active = true;
    if (active && socket.data) socket.data.on("process-update", onProcessUpdate);
    return () => { active = false; if (socket.data) socket.data.off("process-update", onProcessUpdate); };
  }, [pid, processingSteps, totalProcessingSteps, sidebar, isMobile, projectResults, socket.data, router]);

  if (project.isError) return (
    <div className="flex size-full justify-center items-center h-screen p-8">
      <Alert variant="destructive" className="w-fit max-w-[40rem] text-wrap truncate">
        <OctagonAlert className="size-4" />
        <AlertTitle>{project.error.name}</AlertTitle>
        <AlertDescription>{project.error.message}</AlertDescription>
      </Alert>
    </div>
  );

  if (project.isLoading || !project.data) return (
    <div className="flex justify-center items-center h-screen">
      <Loading />
    </div>
  );

  return (
    <ProjectProvider project={project.data} currentImage={currentImage} preview={{ waiting: waitingForPreview, setWaiting: setWaitingForPreview }}>
      <div className="flex flex-col h-screen relative">
        {/* Header */}
        <div className="flex flex-col xl:flex-row justify-center items-start xl:items-center xl:justify-between border-b border-sidebar-border py-2 px-2 md:px-3 xl:px-4 h-fit gap-2">
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <h1 className="text-lg font-semibold truncate">
              {project.data.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({lockState.hasLock
                  ? `Editing ${lockState.expiresAt ? Math.max(0, Math.ceil((lockState.expiresAt - Date.now()) / 1000)) + "s" : ""}`
                  : lockState.isLocked ? "View only" : "Loading..."})
              </span>
            </h1>
            <div className="flex items-center gap-2 xl:hidden">
              <ViewToggle />
              <ModeToggle />
            </div>
          </div>
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <SidebarTrigger variant="outline" className="h-9 w-10 lg:hidden" />
            <div className="flex items-center gap-2 flex-wrap justify-end xl:justify-normal w-full xl:w-auto">
              {mode !== "results" && lockState.hasLock && (
                <>
                  <Button
                    disabled={project.data.tools.length <= 0 || waitingForPreview !== "" || processing}
                    className="inline-flex"
                    onClick={() => {
                      processProject.mutate({ uid: session.user._id, pid: project.data._id, token: session.token }, {
                        onSuccess: () => { setProcessing(true); sidebar.setOpen(false); },
                        onError: (error) => toast({ title: "Ups! Ocorreu um erro.", description: error.message, variant: "destructive" }),
                      });
                    }}
                  >
                    <Play /> Aplicar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={project.data.tools.length <= 0 || clearTools.isPending || waitingForPreview !== "" || processing}
                    onClick={() => {
                      clearTools.mutate({ uid: session.user._id, pid: project.data._id, toolIds: project.data.tools.map(t => t._id), token: session.token }, {
                        onSuccess: () => { broadcastProjectUpdate("tools-cleared"); toast({ title: "Projeto resetado", description: "Todos os filtros foram removidos." }); },
                      });
                    }}
                  >
                    {clearTools.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                  </Button>
                  <AddImagesDialog />
                </>
              )}
              {!lockState.hasLock && (
                <Button onClick={() => { if (socket.data && pid) { socket.data.emit("request-lock", { projectId: pid }); toast({ title: "Requesting edit access", description: "You'll be notified when it's your turn to edit." }); } }} variant="outline">
                  Request Lock
                </Button>
              )}
              <ShareButton projectId={project.data._id} projectName={project.data.name} isOwner={project.data.user_id === session.user._id} />
              <ShareDashboard projectId={project.data._id} projectName={project.data.name} isOwner={project.data.user_id === session.user._id} />
              <Button
                variant="outline"
                className="px-3"
                title="Download projeto"
                disabled={processing}
                onClick={() => {
                  (mode === "edit" ? downloadProjectImages : downloadProjectResults).mutate({ uid: session.user._id, pid: project.data._id, token: session.token, projectName: project.data.name }, {
                    onSuccess: () => { toast({ title: `Projeto ${project.data.name} descarregado.` }); },
                  });
                }}
              >
                {(mode === "edit" ? downloadProjectImages : downloadProjectResults).isPending ? <LoaderCircle className="animate-spin" /> : <Download />}
              </Button>
              <div className="hidden xl:flex items-center gap-2">
                <ViewToggle />
                <ModeToggle />
              </div>
            </div>
          </div>
        </div>

        {/* Lock banner */}
        {lockState.isLocked && !lockState.hasLock && (
          <div className="bg-blue-500/20 text-blue-300 px-4 py-2 text-sm flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            {lockState.lockedBy
              ? `Locked by user ${lockState.lockedBy.substring(0, 8)}... View-only mode. ${lockState.expiresAt ? Math.max(0, Math.ceil((lockState.expiresAt - Date.now()) / 1000)) + "s left" : ""}`
              : "Another user is editing. View-only mode."}
          </div>
        )}

        {/* Main content */}
        <div className="h-full overflow-x-hidden flex">
          {lockState.hasLock ? (mode !== "results" && <Toolbar />) : (
            <div className="w-16 border-r flex flex-col items-center py-4 gap-4 opacity-50 grayscale pointer-events-none">
              <div className="size-10 rounded bg-muted/20" />
              <div className="size-10 rounded bg-muted/20" />
              <div className="size-10 rounded bg-muted/20" />
            </div>
          )}
          {mode === "results" && (projectResults.isLoading || !projectResults.data)
            ? <div className="flex-1 flex items-center justify-center"><LoaderCircle className="size-8 animate-spin text-muted-foreground" /></div>
            : <ProjectImageList setCurrentImageId={setCurrentImage} results={projectResults.data ?? []} />
          }
        </div>

      </div>

      {/* Processing overlay */}
      <Transition show={processing} enter="transition-opacity ease-in duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="transition-opacity ease-out duration-300" leaveFrom="opacity-100" leaveTo="opacity-0">
        <div className="absolute top-0 left-0 h-screen w-screen bg-black/70 z-50 flex justify-center items-center">
          <Card className="p-4 flex flex-col justify-center items-center gap-4">
            <div className="flex gap-2 items-center text-lg font-semibold">
              <h1>Processando</h1>
              <LoaderCircle className="size-[1em] animate-spin" />
            </div>
            <Progress value={processingProgress} className="w-96" />
            <CancelProcessButton isProcessing={processing} onCancel={handleCancel} />
          </Card>
        </div>
      </Transition>
    </ProjectProvider>
  );
}
