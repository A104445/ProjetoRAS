"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectShares } from "@/lib/queries/shares";
import { Settings2, Eye, Edit3 } from "lucide-react";
import { ShareListItem } from "./share-list-item";

interface ShareDashboardProps {
    projectId: string;
    projectName: string;
    isOwner: boolean;
}

export function ShareDashboard({
    projectId,
    projectName,
    isOwner,
}: ShareDashboardProps) {
    const [open, setOpen] = useState(false);
    const { data, isLoading } = useProjectShares(projectId);

    if (!isOwner) return null;

    const shares = data?.shares || [];
    const activeShares = shares.filter((s) => s.isActive && !s.expiresAt);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    Manage Shares
                    {activeShares.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                            {activeShares.length}
                        </Badge>
                    )}
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-4xl min-h-[400px]">
                <DialogHeader>
                    <DialogTitle>Manage Shares for "{projectName}"</DialogTitle>
                    <DialogDescription>
                        View and manage all active share links for this project
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {isLoading ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Loading shares...
                        </div>
                    ) : shares.length === 0 ? (
                        <div className="text-center py-8">
                            <Settings2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                            <p className="text-muted-foreground">
                                No shares yet. Create a share link to get started.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-2">
                                <span>Link</span>
                                <span>Permission</span>
                                <span>Created</span>
                                <span>Accesses</span>
                                <span className="w-20">Actions</span>
                            </div>

                            <div className="space-y-2">
                                {shares.map((share) => (
                                    <ShareListItem
                                        key={share.shareId}
                                        share={share}
                                        projectId={projectId}
                                    />
                                ))}
                            </div>

                            <div className="pt-4 border-t">
                                <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                            <Eye className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium">
                                                {shares.filter((s) => s.permission === "view").length}
                                            </span>
                                            <span className="text-muted-foreground">Viewer{shares.filter((s) => s.permission === "view").length !== 1 ? "s" : ""}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                            <Edit3 className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium">
                                                {shares.filter((s) => s.permission === "edit").length}
                                            </span>
                                            <span className="text-muted-foreground">Editor{shares.filter((s) => s.permission === "edit").length !== 1 ? "s" : ""}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 ml-auto">
                                        <span className="font-medium">
                                            {shares.reduce((acc, s) => acc + s.accessCount, 0)}
                                        </span>
                                        <span className="text-muted-foreground">Total accesses</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
