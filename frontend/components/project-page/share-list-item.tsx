"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Share } from "@/lib/shares";
import { useRevokeShare } from "@/lib/mutations/shares";
import { Copy, Check, Trash2, Eye, Edit3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ShareListItemProps {
    share: Share;
    projectId: string;
}

export function ShareListItem({ share, projectId }: ShareListItemProps) {
    const [copied, setCopied] = useState(false);
    const revokeShareMutation = useRevokeShare();
    const { toast } = useToast();

    const shareUrl = `${window.location.origin}/share/${share.shareId}?token=${share.token}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast({
                title: "Link copied!",
                description: "Share link copied to clipboard",
            });

            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast({
                title: "Failed to copy",
                description: "Please copy the link manually",
                variant: "destructive",
            });
        }
    };

    const handleRevoke = async () => {
        await revokeShareMutation.mutateAsync({
            shareId: share.shareId,
            projectId,
        });
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }).format(date);
    };

    const truncateLink = (url: string, maxLength = 40) => {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + "...";
    };

    return (
        <div
            className={cn(
                "flex items-center justify-between p-3 rounded-lg border bg-card",
                !share.isActive && "opacity-50"
            )}
        >
            <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 mb-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate">
                        {truncateLink(shareUrl)}
                    </code>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCopy}
                        className="h-6 w-6"
                    >
                        {copied ? (
                            <Check className="h-3 w-3 text-green-600" />
                        ) : (
                            <Copy className="h-3 w-3" />
                        )}
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Badge variant={share.permission === "edit" ? "default" : "secondary"}>
                    {share.permission === "edit" ? (
                        <>
                            <Edit3 className="h-3 w-3 mr-1" />
                            Editor
                        </>
                    ) : (
                        <>
                            <Eye className="h-3 w-3 mr-1" />
                            Viewer
                        </>
                    )}
                </Badge>

                <span className="text-sm text-muted-foreground min-w-24">
                    {formatDate(share.createdAt)}
                </span>

                <span className="text-sm font-medium min-w-16 text-center">
                    {share.accessCount} access{share.accessCount !== 1 ? "es" : ""}
                </span>

                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={revokeShareMutation.isPending}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Revoke share link?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently revoke access for this share link. Anyone
                                with this link will no longer be able to access the project.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleRevoke}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Revoke
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
