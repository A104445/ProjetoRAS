"use client";

import { Download, LoaderCircle, OctagonAlert, Play, RotateCcw } from "lucide-react";
import { ProjectImageList } from "@/components/project-page/project-image-list";
import { ViewToggle } from "@/components/project-page/view-toggle";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/toolbar/toolbar";
import Loading from "@/components/loading";
import { ProjectProvider } from "@/providers/project-provider";
import { use, useEffect, useLayoutEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { ProjectImage } from "@/lib/projects";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Transition } from "@headlessui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ModeToggle } from "@/components/project-page/mode-toggle";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { api } from "@/lib/axios";
import { useGetSocket } from "@/lib/queries/projects";

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
    const sidebar = useSidebar();
    const isMobile = useIsMobile();
    const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
    const [waitingForPreview, setWaitingForPreview] = useState<string>("");
    const qc = useQueryClient();

    const isViewer = permission === "view";
    const isEditor = permission === "edit";

    // WebSocket connection for live updates
    const socket = useGetSocket(session.token);

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
    useEffect(() => {
        if (!socket.data || !pid) return;

        // Join the project room
        socket.data.emit("join-project", pid);
        console.log(`Joined project room: ${pid}`);

        // Clean up existing listeners to prevent duplicates
        socket.data.off("project-updated");

        // Listen for project updates
        const handleProjectUpdate = ({ projectId, updateType }: { projectId: string; updateType: string }) => {
            console.log(`Received project update: ${projectId}, type: ${updateType}`);
            if (projectId === pid) {
                qc.invalidateQueries({ queryKey: ["sharedProject", pid] });
                qc.invalidateQueries({ queryKey: ["sharedProjectResults", pid] });
                toast({
                    title: "Project updated",
                    description: "Changes were made to this project.",
                });
            }
        };

        socket.data.on("project-updated", handleProjectUpdate);

        // Lock handling for editors
        if (isEditor) {
            console.log("Editor mode: checking lock status...");

            // Clean up existing lock listeners
            socket.data.off("lock-status");
            socket.data.off("lock-acquired");
            socket.data.off("lock-denied");
            socket.data.off("project-locked");
            socket.data.off("lock-released");

            // First, request lock immediately (server will either grant or deny)
            socket.data.emit("request-lock", { projectId: pid });

            socket.data.on("lock-status", (status: { isLocked: boolean; lockedBy: string | null; hasLock: boolean; expiresAt: number | null }) => {
                console.log("Lock status received:", status);
                setLockState(status);
            });

            socket.data.on("lock-acquired", () => {
                console.log("Lock acquired!");
                setLockState({ isLocked: true, lockedBy: null, hasLock: true, expiresAt: Date.now() + 5 * 60 * 1000 });
                toast({ title: "Edit mode active", description: "You can now make changes." });
            });

            socket.data.on("lock-denied", ({ lockedBy }: { lockedBy: string }) => {
                console.log("Lock denied, locked by:", lockedBy);
                setLockState({ isLocked: true, lockedBy, hasLock: false, expiresAt: null });
                toast({
                    title: "View-only mode",
                    description: "Another editor is currently making changes.",
                });
            });

            socket.data.on("project-locked", ({ lockedBy }: { lockedBy: string }) => {
                setLockState((prev: typeof lockState) => {
                    if (!prev.hasLock) {
                        return { isLocked: true, lockedBy, hasLock: false, expiresAt: null };
                    }
                    return prev;
                });
            });

            socket.data.on("lock-released", () => {
                console.log("Lock released!");
                setLockState((prev: typeof lockState) => {
                    if (!prev.hasLock) {
                        // Try to acquire the released lock
                        socket.data.emit("request-lock", { projectId: pid });
                        return { isLocked: false, lockedBy: null, hasLock: false, expiresAt: null };
                    }
                    return prev;
                });
            });

            socket.data.on("lock-extended", () => {
                setLockState((prev: typeof lockState) => ({
                    ...prev,
                    expiresAt: Date.now() + 5 * 60 * 1000
                }));
            });
        }

        return () => {
            socket.data.emit("leave-project", pid);
            socket.data.off("project-updated", handleProjectUpdate);
            if (isEditor) {
                socket.data.emit("release-lock", { projectId: pid });
                socket.data.off("lock-status");
                socket.data.off("lock-acquired");
                socket.data.off("lock-denied");
                socket.data.off("project-locked");
                socket.data.off("lock-released");
                socket.data.off("lock-extended");
            }
        };
    }, [socket.data, pid, qc, toast, isEditor]);

    // Auto-extend lock for editors every 4 minutes
    useEffect(() => {
        if (!socket.data || !isEditor || !lockState.hasLock) return;

        const interval = setInterval(() => {
            socket.data.emit("extend-lock", { projectId: pid });
        }, 4 * 60 * 1000);

        return () => clearInterval(interval);
    }, [socket.data, pid, isEditor, lockState.hasLock]);

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
                                        : "View only"})
                            </span>
                        </h1>
                        <div className="flex items-center gap-2 xl:hidden">
                            <ViewToggle />
                            {isEditor && lockState.hasLock && <ModeToggle />}
                        </div>
                    </div>
                    <div className="flex items-center justify-between w-full xl:w-auto gap-2">
                        <SidebarTrigger variant="outline" className="h-9 w-10 lg:hidden" />
                        <div className="flex items-center gap-2 flex-wrap justify-end xl:justify-normal w-full xl:w-auto">
                            {/* Only show editing controls for editors */}
                            {isEditor && mode !== "results" && (
                                <>
                                    <Button
                                        disabled={
                                            project.data.tools?.length <= 0 || waitingForPreview !== ""
                                        }
                                        className="inline-flex"
                                        onClick={() => {
                                            toast({
                                                title: "Processing...",
                                                description: "This feature is being implemented for shared projects.",
                                            });
                                        }}
                                    >
                                        <Play /> Apply
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={
                                            project.data.tools?.length <= 0 ||
                                            waitingForPreview !== ""
                                        }
                                        onClick={() => {
                                            toast({
                                                title: "Reset",
                                                description: "This feature is being implemented for shared projects.",
                                            });
                                        }}
                                    >
                                        <RotateCcw />
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
                                {isEditor && lockState.hasLock && <ModeToggle />}
                            </div>
                        </div>
                    </div>
                </div>
                {/* Lock status banner for editors */}
                {isEditor && lockState.isLocked && !lockState.hasLock && (
                    <div className="bg-yellow-500/20 text-yellow-300 px-4 py-2 text-sm flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        {lockState.lockedBy
                            ? `Locked by user ${lockState.lockedBy.substring(0, 8)}... View-only mode. (${lockState.expiresAt ? Math.max(0, Math.ceil((lockState.expiresAt - Date.now()) / 1000)) + "s left" : "No time"})`
                            : "Another editor is making changes. View-only mode."}
                    </div>
                )}
                {/* Main Content */}
                <div className="h-full overflow-x-hidden flex">
                    {isEditor && lockState.hasLock && mode !== "results" && <Toolbar />}
                    <ProjectImageList
                        setCurrentImageId={setCurrentImage}
                        results={projectResults.data ?? { imgs: [], texts: [] }}
                    />
                </div>
            </div>
        </ProjectProvider>
    );
}
