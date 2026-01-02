"use client";

import { Download, LoaderCircle, OctagonAlert, Play, RotateCcw } from "lucide-react";
import { ProjectImageList } from "@/components/project-page/project-image-list";
import { ViewToggle } from "@/components/project-page/view-toggle";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/toolbar/toolbar";
import Loading from "@/components/loading";
import { ProjectProvider } from "@/providers/project-provider";
import { use, useEffect, useLayoutEffect, useState, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { ProjectImage } from "@/lib/projects";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ModeToggle } from "@/components/project-page/mode-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "@/lib/axios";
import { useGetSocket } from "@/lib/queries/projects";
import { useClearSharedProjectTools, useProcessSharedProject } from "@/lib/mutations/projects";

// Custom hook to fetch shared project
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

// Custom hook to fetch shared project results
function useGetSharedProjectResults(projectId: string, token: string) {
    return useQuery({
        queryKey: ["sharedProjectResults", projectId],
        queryFn: async () => {
            const response = await api.get(`/projects/shared/${projectId}/results`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data as { imgs: { og_img_id: string; name: string; url: string }[]; texts: { og_img_id: string; name: string; url: string }[] };
        },
        enabled: !!projectId && !!token,
    });
}

export default function SharedProject({
    params,
}: {
    params: Promise<{ pid: string }>;
}) {
    const resolvedParams = use(params);
    const session = useSession();
    const { pid } = resolvedParams;
    const searchParams = useSearchParams();
    const permission = searchParams.get("permission") ?? "view";
    const project = useGetSharedProject(pid, session.token);
    const projectResults = useGetSharedProjectResults(pid, session.token);
    const { toast } = useToast();
    const view = searchParams.get("view") ?? "grid";
    const mode = searchParams.get("mode") ?? "edit";
    const router = useRouter();
    const path = usePathname();
    const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
    const [waitingForPreview, setWaitingForPreview] = useState<string>("");
    const qc = useQueryClient();

    // Use server-verified permission from project data, not URL parameter
    // This prevents users from changing URL to gain edit access
    const urlPermission = searchParams.get("permission") ?? "view";
    const serverRole = project.data?._accessRole;

    // If server says 'view' but URL says 'edit', treat as viewer (security)
    // If server says 'edit' or 'owner', allow edit access
    const verifiedPermission = serverRole === 'edit' || serverRole === 'owner'
        ? urlPermission
        : 'view'; // Force view-only if server doesn't grant edit access

    const isViewer = verifiedPermission === "view" || serverRole === "view";
    const isEditor = verifiedPermission === "edit" && (serverRole === "edit" || serverRole === "owner");

    // WebSocket connection for live updates
    const socket = useGetSocket(session.token);

    // Mutations for processing (use current user's ID for permission checking)
    const processProject = useProcessSharedProject();
    const clearTools = useClearSharedProjectTools(pid);

    // Lock state for editors
    const [lockState, setLockState] = useState<{
        isLocked: boolean;
        lockedBy: string | null;
        hasLock: boolean;
        expiresAt: number | null;
    }>({
        isLocked: false,
        lockedBy: null,
        hasLock: false,
        expiresAt: null
    });

    // Ticker to force re-render for countdown
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(timer);
    }, []);
    const joinedRef = useRef(false);
    // Debugging dependencies
    const prevSocketData = useRef(socket.data);
    const prevPid = useRef(pid);

    // Combined effect for socket connection, room joining, and lock management
    useEffect(() => {
        if (!socket.data || !pid) return;

        // Log what changed
        if (socket.data !== prevSocketData.current) {
            console.log("Shared Effect re-run due to: socket.data changed");
            prevSocketData.current = socket.data;
        }
        if (pid !== prevPid.current) {
            console.log("Shared Effect re-run due to: pid changed");
            prevPid.current = pid;
        }

        // Join the project room
        console.log(`Joining project room: ${pid}`);
        socket.data.emit("join-project", pid);
        joinedRef.current = true;

        // Clean up existing listeners to prevent duplicates
        socket.data.off("project-updated");
        socket.data.off("lock-status");
        socket.data.off("lock-acquired");
        socket.data.off("lock-queued");
        socket.data.off("lock-denied");
        socket.data.off("project-locked");
        socket.data.off("lock-released");
        socket.data.off("lock-extended");

        // Listen for project updates
        socket.data.on("project-updated", ({ projectId, updateType }: { projectId: string; updateType: string }) => {
            console.log(`Received project update: ${projectId}, type: ${updateType}`);
            if (projectId === pid) {
                // Force immediate refetch instead of just invalidating
                qc.refetchQueries({ queryKey: ["sharedProject", pid] });
                qc.refetchQueries({ queryKey: ["sharedProjectResults", pid] });
                toast({
                    title: "Project updated",
                    description: "Changes were made to this project.",
                });
            }
        });

        // Lock management for editors
        if (isEditor) {
            console.log("Editor mode: setting up lock listeners and requesting lock...");

            socket.data.on("lock-status", (status: { isLocked: boolean; lockedBy: string | null; hasLock: boolean; expiresAt: number | null }) => {
                console.log("Lock status received:", status);
                setLockState(status);
            });

            socket.data.on("lock-acquired", () => {
                console.log("Lock acquired!");
                setLockState({ isLocked: true, lockedBy: null, hasLock: true, expiresAt: Date.now() + 60 * 1000 });
                // Force refetch project data when lock is acquired to get latest changes
                qc.refetchQueries({ queryKey: ["sharedProject", pid] });
                toast({ title: "Edit mode active", description: "You can now make changes." });
            });

            socket.data.on("lock-queued", ({ position }: { position: number }) => {
                console.log("Lock queued, position:", position);
                setLockState(prev => ({ ...prev, isLocked: true, hasLock: false }));
                toast({
                    title: "Queued for Edit",
                    description: `You are #${position} in line for editing.`,
                });
            });

            socket.data.on("lock-denied", ({ lockedBy }: { lockedBy: string }) => {
                console.log("Lock denied, locked by:", lockedBy);
                setLockState({ isLocked: true, lockedBy, hasLock: false, expiresAt: null });
                toast({
                    title: "View-only mode",
                    description: "Another editor is currently making changes.",
                });
            });

            socket.data.on("project-locked", ({ lockedBy, expiresAt }: { lockedBy: string, expiresAt: number | null }) => {
                setLockState((prev) => {
                    if (!prev.hasLock) {
                        return { isLocked: true, lockedBy, hasLock: false, expiresAt: expiresAt };
                    }
                    return prev;
                });
            });

            socket.data.on("lock-released", () => {
                console.log("Lock released - backend will auto-promote queue");
                // Backend automatically promotes next in queue, no need to request
                setLockState({ isLocked: false, lockedBy: null, hasLock: false, expiresAt: null });
            });

            socket.data.on("lock-extended", () => {
                setLockState((prev) => ({
                    ...prev,
                    expiresAt: Date.now() + 60 * 1000
                }));
            });

            // Request lock after listeners are set up
            socket.data.emit("request-lock", { projectId: pid });
        }

        return () => {
            if (socket.data) {
                console.log("Shared page connection cleanup");
                socket.data.emit("leave-project", pid);
                socket.data.off("project-updated");
                if (isEditor) {
                    console.log("Releasing lock on cleanup");
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
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket.data, pid, isEditor]);


    // Refetch results when switching to results mode
    useEffect(() => {
        if (mode === "results") {
            projectResults.refetch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Process update handler - track updates and navigate to results when complete
    const totalProcessingSteps = (project.data?.imgs?.length || 1) * (project.data?.tools?.length || 1);
    const processedStepsRef = useRef(0);

    useEffect(() => {
        if (!socket.data) return;

        function onProcessUpdate() {
            processedStepsRef.current += 1;
            console.log(`Process update received: ${processedStepsRef.current}/${totalProcessingSteps}`);

            if (processedStepsRef.current >= totalProcessingSteps) {
                console.log("Processing complete, waiting for results to be ready...");
                processedStepsRef.current = 0;
                toast({
                    title: "Processing complete",
                    description: "Loading results...",
                });

                // Poll for results until they're available
                const pollForResults = async () => {
                    const maxAttempts = 20; // Max 20 seconds
                    let attempts = 0;

                    const checkResults = async (): Promise<boolean> => {
                        attempts++;
                        const result = await projectResults.refetch();
                        const hasResults = result.data?.imgs && result.data.imgs.length > 0;

                        if (hasResults) {
                            return true;
                        }

                        if (attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            return checkResults();
                        }

                        return false;
                    };

                    const found = await checkResults();
                    if (found) {
                        const params = new URLSearchParams(searchParams.toString());
                        params.set("mode", "results");
                        params.set("view", "grid");
                        router.push(`${path}?${params.toString()}`);
                    } else {
                        toast({
                            title: "Results not ready",
                            description: "Please try switching to results mode manually.",
                            variant: "destructive",
                        });
                    }
                };

                pollForResults();
            }
        }

        socket.data.on("process-update", onProcessUpdate);

        return () => {
            if (socket.data) socket.data.off("process-update", onProcessUpdate);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket.data, totalProcessingSteps]);

    useLayoutEffect(() => {
        if (
            !["edit", "results"].includes(mode) ||
            !["grid", "carousel"].includes(view)
        ) {
            router.replace(path);
        }
    }, [mode, view, path, router]);

    if (project.isError)
        return (
            <div className="flex size-full justify-center items-center h-screen p-8">
                <Alert
                    variant="destructive"
                    className="w-fit max-w-[40rem] text-wrap truncate"
                >
                    <OctagonAlert className="size-4" />
                    <AlertTitle>{project.error.name}</AlertTitle>
                    <AlertDescription>{project.error.message}</AlertDescription>
                </Alert>
            </div>
        );

    if (project.isLoading || !project.data)
        return (
            <div className="flex justify-center items-center h-screen">
                <Loading />
            </div>
        );

    return (
        <ProjectProvider
            project={project.data}
            currentImage={currentImage}
            preview={{ waiting: waitingForPreview, setWaiting: setWaitingForPreview }}
        >
            <div className="flex flex-col h-screen relative">
                {/* Header */}
                <div className="flex flex-col xl:flex-row justify-center items-start xl:items-center xl:justify-between border-b border-sidebar-border py-2 px-2 md:px-3 xl:px-4 h-fit gap-2">
                    <div className="flex items-center justify-between w-full xl:w-auto gap-2">
                        <h1 className="text-lg font-semibold truncate">
                            {project.data.name}
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                ({isViewer
                                    ? "View only"
                                    : lockState.hasLock
                                        ? `Editing ${lockState.expiresAt ? Math.max(0, Math.ceil((lockState.expiresAt - Date.now()) / 1000)) + "s" : ""}`
                                        : lockState.isLocked
                                            ? "View only"
                                            : "Loading..."})
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
                            {/* Only show editing controls for editors with lock */}
                            {isEditor && lockState.hasLock && mode !== "results" && (
                                <>
                                    <Button
                                        disabled={
                                            project.data.tools?.length <= 0 ||
                                            waitingForPreview !== "" ||
                                            processProject.isPending
                                        }
                                        className="inline-flex"
                                        onClick={() => {
                                            processProject.mutate(
                                                {
                                                    pid: project.data._id,
                                                    userId: session.user._id,
                                                    token: session.token,
                                                },
                                                {
                                                    onSuccess: () => {
                                                        // Reset steps counter for new processing
                                                        processedStepsRef.current = 0;
                                                        toast({
                                                            title: "Processing started",
                                                            description: "Your images are being processed.",
                                                        });
                                                    },
                                                    onError: (error: Error) =>
                                                        toast({
                                                            title: "Error",
                                                            description: error.message,
                                                            variant: "destructive",
                                                        }),
                                                },
                                            );
                                        }}
                                    >
                                        {processProject.isPending ? (
                                            <LoaderCircle className="animate-spin" />
                                        ) : (
                                            <Play />
                                        )}
                                        Apply
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={
                                            project.data.tools?.length <= 0 ||
                                            waitingForPreview !== "" ||
                                            clearTools.isPending
                                        }
                                        onClick={() => {
                                            clearTools.mutate(
                                                {
                                                    pid: project.data._id,
                                                    userId: session.user._id,
                                                    token: session.token,
                                                },
                                                {
                                                    onSuccess: () => {
                                                        toast({
                                                            title: "Project reset",
                                                            description: "All filters have been removed.",
                                                        });
                                                    },
                                                },
                                            );
                                        }}
                                    >
                                        {clearTools.isPending ? (
                                            <LoaderCircle className="animate-spin" />
                                        ) : (
                                            <RotateCcw />
                                        )}
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="outline"
                                className="px-3"
                                title="Download project"
                                onClick={() => {
                                    toast({
                                        title: "Download",
                                        description: "This feature is being implemented for shared projects.",
                                    });
                                }}
                            >
                                <Download />
                            </Button>
                            <div className="hidden xl:flex items-center gap-2">
                                <ViewToggle />
                                <ModeToggle />
                            </div>
                        </div>
                    </div>
                </div>
                {/* Lock status banner for editors */}
                {isEditor && lockState.isLocked && !lockState.hasLock && (
                    <div className="bg-blue-500/20 text-blue-300 px-4 py-2 text-sm flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        {lockState.lockedBy
                            ? `Locked by user ${lockState.lockedBy.substring(0, 8)}... View-only mode. (${lockState.expiresAt ? Math.max(0, Math.ceil((lockState.expiresAt - Date.now()) / 1000)) + "s left" : "No time"})`
                            : "Another editor is making changes. View-only mode."}
                    </div>
                )}
                {/* Main Content */}
                <div className="h-full overflow-x-hidden flex">
                    {isEditor && lockState.hasLock && mode !== "results" && <Toolbar />}
                    {mode === "results" && (projectResults.isLoading || !projectResults.data) ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2">
                            <Loading />
                            <span className="text-sm text-muted-foreground">
                                {isViewer ? "View only" : isEditor ? "Editor" : ""}
                            </span>
                        </div>
                    ) : (
                        <ProjectImageList
                            setCurrentImageId={setCurrentImage}
                            results={projectResults.data ?? { imgs: [], texts: [] }}
                        />
                    )}
                </div>
            </div>
        </ProjectProvider>
    );
}
