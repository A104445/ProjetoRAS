"use client";

import { Download, LoaderCircle, OctagonAlert, Play, RotateCcw } from "lucide-react";
import { ProjectImageList } from "@/components/project-page/project-image-list";
import { ViewToggle } from "@/components/project-page/view-toggle";
import { ModeToggle } from "@/components/project-page/mode-toggle";
import { Toolbar } from "@/components/toolbar/toolbar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Loading from "@/components/loading";
import { ProjectProvider } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { useGetSocket } from "@/lib/queries/projects";
import { useClearSharedProjectTools, useProcessSharedProject, useCancelSharedProjectProcess } from "@/lib/mutations/projects";
import { ProjectImage } from "@/lib/projects";
import { use, useEffect, useLayoutEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/axios";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Transition } from "@headlessui/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { CancelProcessButton } from "@/components/project-page/cancel-process-button";

// Fetch shared project
function useGetSharedProject(projectId: string, token: string) {
    return useQuery({
        queryKey: ["sharedProject", projectId],
        queryFn: async () => {
            const response = await api.get(`/projects/shared/${projectId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data;
        },
        enabled: !!projectId && !!token,
    });
}

// Fetch shared project results
function useGetSharedProjectResults(projectId: string, token: string) {
    return useQuery({
        queryKey: ["sharedProjectResults", projectId],
        queryFn: async () => {
            const response = await api.get(`/projects/shared/${projectId}/results`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data as {
                imgs: { og_img_id: string; name: string; url: string }[];
                texts: { og_img_id: string; name: string; url: string }[];
            };
        },
        enabled: !!projectId && !!token,
    });
}

export default function SharedProject({ params }: { params: Promise<{ pid: string }> }) {
    const resolvedParams = use(params);
    const { pid } = resolvedParams;
    const session = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    const path = usePathname();
    const { toast } = useToast();
    const qc = useQueryClient();

    const project = useGetSharedProject(pid, session.token);
    const projectResults = useGetSharedProjectResults(pid, session.token);

    const view = searchParams.get("view") ?? "grid";
    const mode = searchParams.get("mode") ?? "edit";
    const sidebar = useSidebar();
    const isMobile = useIsMobile();

    const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
    const [waitingForPreview, setWaitingForPreview] = useState<string>("");
    const [processing, setProcessing] = useState<boolean>(false);
    const [processingProgress, setProcessingProgress] = useState<number>(0);
    const [processingSteps, setProcessingSteps] = useState<number>(1);

    // Permission handling
    const serverRole = project.data?._accessRole;
    const urlPermission = searchParams.get("permission") ?? "view";
    const verifiedPermission = serverRole === "edit" || serverRole === "owner" ? urlPermission : "view";

    const isViewer = verifiedPermission === "view" || serverRole === "view";
    const isEditor = verifiedPermission === "edit" && (serverRole === "edit" || serverRole === "owner");

    // WebSocket
    const socket = useGetSocket(session.token);

    // Mutations
    const processProject = useProcessSharedProject();
    const clearTools = useClearSharedProjectTools(pid);
    const cancelProcess = useCancelSharedProjectProcess(pid, session.token);

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

    // Lock state
    const [lockState, setLockState] = useState({
        isLocked: false,
        lockedBy: null,
        hasLock: false,
        expiresAt: null as number | null,
    });

    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    const joinedRef = useRef(false);
    const prevSocketData = useRef(socket.data);
    const prevPid = useRef(pid);

    // Socket effect: join room, listen for updates, manage locks
    useEffect(() => {
        if (!socket.data || !pid) return;

        if (socket.data !== prevSocketData.current) prevSocketData.current = socket.data;
        if (pid !== prevPid.current) prevPid.current = pid;

        socket.data.emit("join-project", pid);
        joinedRef.current = true;

        socket.data.off("project-updated");
        socket.data.off("lock-status");
        socket.data.off("lock-acquired");
        socket.data.off("lock-queued");
        socket.data.off("lock-denied");
        socket.data.off("project-locked");
        socket.data.off("lock-released");
        socket.data.off("lock-extended");

        // Project updates
        socket.data.on("project-updated", ({ projectId }) => {
            if (projectId === pid) {
                qc.refetchQueries({ queryKey: ["sharedProject", pid] });
                qc.refetchQueries({ queryKey: ["sharedProjectResults", pid] });
                toast({ title: "Project updated", description: "Changes were made to this project." });
            }
        });

        if (isEditor) {
            // Lock events
            socket.data.on("lock-status", setLockState);
            socket.data.on("lock-acquired", () => {
                setLockState({ isLocked: true, lockedBy: null, hasLock: true, expiresAt: Date.now() + 60_000 });
                qc.refetchQueries({ queryKey: ["sharedProject", pid] });
                toast({ title: "Edit mode active", description: "You can now make changes." });
            });
            socket.data.on("lock-queued", ({ position }) => {
                setLockState(prev => ({ ...prev, isLocked: true, hasLock: false }));
                toast({ title: "Queued for Edit", description: `You are #${position} in line for editing.` });
            });
            socket.data.on("lock-denied", ({ lockedBy }) => {
                setLockState({ isLocked: true, lockedBy, hasLock: false, expiresAt: null });
                toast({ title: "View-only mode", description: "Another editor is currently making changes." });
            });
            socket.data.on("project-locked", ({ lockedBy, expiresAt }) => {
                setLockState(prev => !prev.hasLock ? { isLocked: true, lockedBy, hasLock: false, expiresAt } : prev);
            });
            socket.data.on("lock-released", () => setLockState({ isLocked: false, lockedBy: null, hasLock: false, expiresAt: null }));
            socket.data.on("lock-extended", () => setLockState(prev => ({ ...prev, expiresAt: Date.now() + 60_000 })));

            // Request lock
            socket.data.emit("request-lock", { projectId: pid });
        }

        return () => {
            if (!socket.data) return;
            socket.data.emit("leave-project", pid);
            socket.data.off("project-updated");
            if (isEditor) {
                socket.data.emit("release-lock", { projectId: pid });
                socket.data.off("lock-status");
                socket.data.off("lock-acquired");
                socket.data.off("lock-queued");
                socket.data.off("lock-denied");
                socket.data.off("project-locked");
                socket.data.off("lock-released");
                socket.data.off("lock-extended");
            }
            joinedRef.current = false;
        };
    }, [socket.data, pid, isEditor]);

    // Refetch results when switching to results mode
    useEffect(() => { if (mode === "results") projectResults.refetch(); }, [mode]);

    // Process updates
    const totalProcessingSteps = (project.data?.tools?.length ?? 0) * (project.data?.imgs?.length ?? 0);

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
                        const params = new URLSearchParams(searchParams.toString());
                        params.set("mode", "results");
                        params.set("view", "grid");
                        router.push(`${path}?${params.toString()}`);
                    });
                }, 2000);
            }
        }

        let active = true;
        if (active && socket.data) socket.data.on("process-update", onProcessUpdate);
        return () => { active = false; if (socket.data) socket.data.off("process-update", onProcessUpdate); };
    }, [pid, processingSteps, totalProcessingSteps, sidebar, isMobile, projectResults, socket.data, router, searchParams, path]);

    // Sanitize mode/view
    useLayoutEffect(() => {
        if (!["edit", "results"].includes(mode) || !["grid", "carousel"].includes(view)) router.replace(path);
    }, [mode, view, path, router]);

    if (project.isError)
        return (
            <div className="flex size-full justify-center items-center h-screen p-8">
                <Alert variant="destructive" className="w-fit max-w-[40rem] text-wrap truncate">
                    <OctagonAlert className="size-4" />
                    <AlertTitle>{project.error.name}</AlertTitle>
                    <AlertDescription>{project.error.message}</AlertDescription>
                </Alert>
            </div>
        );

    if (project.isLoading || !project.data)
        return <div className="flex justify-center items-center h-screen"><Loading /></div>;

    return (
        <ProjectProvider project={project.data} currentImage={currentImage} preview={{ waiting: waitingForPreview, setWaiting: setWaitingForPreview }}>
            <div className="flex flex-col h-screen relative">
                {/* Header */}
                <div className="flex flex-col xl:flex-row justify-between border-b border-sidebar-border py-2 px-2 md:px-3 xl:px-4 gap-2">
                    <div className="flex items-center justify-between w-full xl:w-auto gap-2">
                        <h1 className="text-lg font-semibold truncate">
                            {project.data.name}
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                {isViewer
                                    ? "View only"
                                    : lockState.hasLock
                                        ? `Editing ${lockState.expiresAt ? Math.max(0, Math.ceil((lockState.expiresAt - Date.now()) / 1000)) + "s" : ""}`
                                        : lockState.isLocked
                                            ? "View only"
                                            : "Loading..."}
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
                            {isEditor && lockState.hasLock && mode !== "results" && (
                                <>
                                    <Button
                                        disabled={project.data.tools?.length <= 0 || waitingForPreview !== "" || processing}
                                        className="inline-flex"
                                        onClick={() => processProject.mutate({ pid: project.data._id, userId: session.user._id, token: session.token }, { onSuccess: () => { setProcessing(true); sidebar.setOpen(false); }, onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }) })}
                                    >
                                        <Play /> Aplicar
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={project.data.tools?.length <= 0 || waitingForPreview !== "" || clearTools.isPending || processing}
                                        onClick={() => clearTools.mutate({ pid: project.data._id, userId: session.user._id, token: session.token }, { onSuccess: () => toast({ title: "Project reset", description: "All filters have been removed." }) })}
                                    >
                                        {clearTools.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                                    </Button>
                                </>
                            )}
                            {isEditor && !lockState.hasLock && (
                                <Button variant="outline" onClick={() => socket.data?.emit("request-lock", { projectId: pid })}>Request Lock</Button>
                            )}
                            <Button variant="outline" className="px-3" title="Download project" disabled={processing} onClick={() => toast({ title: "Download", description: "This feature is being implemented for shared projects." })}>
                                <Download />
                            </Button>
                            <div className="hidden xl:flex items-center gap-2">
                                <ViewToggle />
                                <ModeToggle />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lock banner */}
                {isEditor && lockState.isLocked && !lockState.hasLock && (
                    <div className="bg-blue-500/20 text-blue-300 px-4 py-2 text-sm flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        {lockState.lockedBy
                            ? `Locked by user ${lockState.lockedBy.substring(0, 8)}... View-only mode. (${lockState.expiresAt ? Math.max(0, Math.ceil((lockState.expiresAt - Date.now()) / 1000)) + "s left" : "No time"})`
                            : "Another editor is making changes. View-only mode."}
                    </div>
                )}

                {/* Main content */}
                <div className="h-full overflow-x-hidden flex">
                    {isEditor && lockState.hasLock && mode !== "results" && <Toolbar />}
                    {mode === "results" && (projectResults.isLoading || !projectResults.data) ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2">
                            <Loading />
                            <span className="text-sm text-muted-foreground">{isViewer ? "View only" : "Editor"}</span>
                        </div>
                    ) : (
                        <ProjectImageList setCurrentImageId={setCurrentImage} results={projectResults.data ?? { imgs: [], texts: [] }} />
                    )}
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
