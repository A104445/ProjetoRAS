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
                                ({isViewer ? "View only" : "Editor"})
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
                                <ModeToggle />
                            </div>
                        </div>
                    </div>
                </div>
                {/* Main Content */}
                <div className="h-full overflow-x-hidden flex">
                    {isEditor && mode !== "results" && <Toolbar />}
                    <ProjectImageList
                        setCurrentImageId={setCurrentImage}
                        results={[]}
                    />
                </div>
            </div>
        </ProjectProvider>
    );
}
