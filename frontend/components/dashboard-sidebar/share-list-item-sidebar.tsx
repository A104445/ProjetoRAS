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

interface ShareListItemSidebarProps {
    share: Share;
    projectId: string;
}

export function ShareListItem({ share, projectId }: ShareListItemSidebarProps) {
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
            });

            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast({
                title: "Failed to copy",
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
        }).format(date);
    };

    const truncateLink = (url: string, maxLength = 30) => {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + "...";
    };

    return (
        <div
            className={cn(
                "flex flex-col gap-2 p-3 rounded-lg border bg-card",
                !share.isActive && "opacity-50"
            )}
        >
            <div className="flex items-center justify-between">
                <Badge variant={share.permission === "edit" ? "default" : "secondary"} className="text-xs">
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

                <div className="flex items-center gap-1">
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCopy}
                        className="h-7 w-7"
                    >
                        {copied ? (
                            <Check className="h-3 w-3 text-green-600" />
                        ) : (
                            <Copy className="h-3 w-3" />
                        )}
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                disabled={revokeShareMutation.isPending}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Revoke share link?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently revoke access for this share link.
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

            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <code className="bg-muted px-2 py-0.5 rounded font-mono truncate flex-1 mr-2">
                    {truncateLink(shareUrl, 25)}
                </code>
                <span>{formatDate(share.createdAt)}</span>
            </div>

            <div className="text-xs text-muted-foreground">
                {share.accessCount} access{share.accessCount !== 1 ? "es" : ""}
            </div>
        </div>
    );
}
