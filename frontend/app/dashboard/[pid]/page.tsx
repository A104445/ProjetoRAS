"use client";

import { Download, LoaderCircle, OctagonAlert, Play, RotateCcw, Lock, Hourglass } from "lucide-react";
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
import { useProjectLock } from "@/hooks/use-project-lock"; // Certifica-te que criaste este hook

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
    const urlPermission = searchParams.get("permission") ?? "edit";
    
    // Lógica de Permissões: É editor se o URL disser "edit" E o servidor confirmar a role
    const verifiedPermission = serverRole === "edit" || serverRole === "owner" ? urlPermission : "view";
    const isViewer = verifiedPermission === "view" || serverRole === "view";
    const isEditor = verifiedPermission === "edit" && (serverRole === "edit" || serverRole === "owner");

    // --- NOVO: HOOK DE GESTÃO DE LOCK ---
    // Este hook trata de toda a lógica de adquirir lock, fila de espera e heartbeats
    const lockState = useProjectLock(pid, isEditor, session.token);

    // WebSocket (Ainda necessário para atualizações do projeto e progresso)
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

    const joinedRef = useRef(false);
    const prevSocketData = useRef(socket.data);
    const prevPid = useRef(pid);

    // Socket effect: Apenas para Project Updates e Process Updates
    // (A lógica de Lock foi movida para o hook useProjectLock)
    useEffect(() => {
        if (!socket.data || !pid) return;

        if (socket.data !== prevSocketData.current) prevSocketData.current = socket.data;
        if (pid !== prevPid.current) prevPid.current = pid;

        // Entrar na sala (necessário para receber notificações de update do projeto)
        // Nota: O useProjectLock também faz join, mas não faz mal ser redundante aqui para garantir
        socket.data.emit("join-project", pid);
        joinedRef.current = true;

        socket.data.off("project-updated");

        // Project updates (ex: outro utilizador mudou o nome ou adicionou imagens)
        socket.data.on("project-updated", ({ projectId }) => {
            if (projectId === pid) {
                qc.refetchQueries({ queryKey: ["sharedProject", pid] });
                qc.refetchQueries({ queryKey: ["sharedProjectResults", pid] });
                toast({ title: "Projeto atualizado", description: "Foram detetadas alterações neste projeto." });
            }
        });

        return () => {
            if (!socket.data) return;
            // Não fazemos leave-project aqui para não interferir com o hook de lock
            // O hook de lock trata do cleanup final
            socket.data.off("project-updated");
            joinedRef.current = false;
        };
    }, [socket.data, pid, qc, toast]);

    // Refetch results when switching to results mode
    useEffect(() => { if (mode === "results") projectResults.refetch(); }, [mode, projectResults]);

    // Process updates logic
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
                        <div className="flex flex-col">
                            <h1 className="text-lg font-semibold truncate">
                                {project.data.name}
                            </h1>
                            {/* STATUS DE PARTILHA E LOCK */}
                            <div className="text-xs flex items-center gap-2 mt-1">
                                {!isEditor && <span className="text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">Modo de Leitura</span>}
                                
                                {isEditor && lockState.hasLock && (
                                    <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                                        <Lock size={12} /> A editar
                                    </span>
                                )}
                                
                                {isEditor && lockState.queuePosition !== null && (
                                    <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                                        <Hourglass size={12} /> Na fila: Posição {lockState.queuePosition}
                                    </span>
                                )}
                                
                                {isEditor && lockState.isLocked && !lockState.hasLock && lockState.queuePosition === null && (
                                    <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1">
                                        <Lock size={12} /> Bloqueado por: {lockState.lockedByName || "Outro utilizador"}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2 xl:hidden">
                            <ViewToggle />
                            <ModeToggle />
                        </div>
                    </div>
                    <div className="flex items-center justify-between w-full xl:w-auto gap-2">
                        <SidebarTrigger variant="outline" className="h-9 w-10 lg:hidden" />
                        <div className="flex items-center gap-2 flex-wrap justify-end xl:justify-normal w-full xl:w-auto">
                            {/* Botões de Ação apenas se tiver o LOCK */}
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
                            
                            {/* Se for editor mas não tem o lock, pode tentar pedir manualmente (opcional, pois o hook já tenta) */}
                            {isEditor && !lockState.hasLock && !lockState.isLocked && (
                                <Button variant="outline" onClick={() => socket.data?.emit("request-lock", { projectId: pid })}>
                                    <Lock className="mr-2 h-4 w-4"/> Pedir Edição
                                </Button>
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

                {/* --- AVISOS DE BLOQUEIO (BANNER) --- */}
                {isEditor && !lockState.hasLock && (
                    <div className="bg-yellow-50 border-b border-yellow-200 p-2 text-center text-sm text-yellow-800 flex justify-center items-center gap-2">
                        <Lock size={14} />
                        {lockState.queuePosition 
                            ? `Você está na fila de espera (Posição ${lockState.queuePosition}). Aguarde a sua vez (aprox. ${Math.ceil((lockState.estimatedWait || 0)/60)} min).` 
                            : `O projeto está bloqueado por ${lockState.lockedByName || "outro utilizador"}. Você está em modo de leitura.`}
                    </div>
                )}

                {/* Main content */}
                <div className="h-full overflow-x-hidden flex">
                    {/* Toolbar só aparece se tivermos o Lock */}
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