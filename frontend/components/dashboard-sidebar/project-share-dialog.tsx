"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateShare } from "@/lib/mutations/shares";
import { useProjectShares } from "@/lib/queries/shares";
import { Copy, Check, Eye, Edit3, Trash2, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ShareListItem } from "./share-list-item-sidebar";

interface ProjectShareDialogProps {
    projectId: string;
    projectName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ProjectShareDialog({
    projectId,
    projectName,
    open,
    onOpenChange,
}: ProjectShareDialogProps) {
    const [permission, setPermission] = useState<"view" | "edit">("view");
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    const createShareMutation = useCreateShare();
    const { data: sharesData, isLoading } = useProjectShares(projectId);

    const handleGenerateLink = async () => {
        try {
            const result = await createShareMutation.mutateAsync({
                projectId,
                permission,
            });

            setGeneratedLink(result.shareUrl);
        } catch (error) {
            // Error handled by mutation
        }
    };

    const handleCopyLink = async () => {
        if (!generatedLink) return;

        try {
            await navigator.clipboard.writeText(generatedLink);
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

    const handleClose = () => {
        setGeneratedLink(null);
        setCopied(false);
        onOpenChange(false);
    };

    const shares = sharesData?.shares || [];

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Share "{projectName}"</DialogTitle>
                    <DialogDescription>
                        Create and manage share links with specific permissions
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="create" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="create">Create Link</TabsTrigger>
                        <TabsTrigger value="manage">
                            Manage
                            {shares.length > 0 && (
                                <Badge variant="secondary" className="ml-2">
                                    {shares.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="create" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="permission">Permission Level</Label>
                            <Select
                                value={permission}
                                onValueChange={(value) => setPermission(value as "view" | "edit")}
                            >
                                <SelectTrigger id="permission">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="view">
                                        <div className="flex items-center gap-2">
                                            <Eye className="h-4 w-4" />
                                            <div>
                                                <div className="font-medium">Viewer</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Can view the project
                                                </div>
                                            </div>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="edit">
                                        <div className="flex items-center gap-2">
                                            <Edit3 className="h-4 w-4" />
                                            <div>
                                                <div className="font-medium">Editor</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Can edit the project
                                                </div>
                                            </div>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {!generatedLink ? (
                            <Button
                                onClick={handleGenerateLink}
                                disabled={createShareMutation.isPending}
                                className="w-full"
                            >
                                {createShareMutation.isPending ? "Generating..." : "Generate Link"}
                            </Button>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={generatedLink}
                                        readOnly
                                        className="flex-1 font-mono text-sm"
                                    />
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        onClick={handleCopyLink}
                                    >
                                        {copied ? (
                                            <Check className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>

                                <p className="text-sm text-muted-foreground">
                                    Link created successfully! Share it with others to give them access.
                                </p>

                                <Button
                                    variant="outline"
                                    onClick={() => setGeneratedLink(null)}
                                    className="w-full"
                                >
                                    Create Another Link
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="manage" className="space-y-3 mt-4">
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
                                    <div className="flex items-center gap-4 text-sm flex-wrap">
                                        <div className="flex items-center gap-1">
                                            <Eye className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium">
                                                {shares.filter((s) => s.permission === "view").length}
                                            </span>
                                            <span className="text-muted-foreground">Viewer{shares.filter((s) => s.permission === "view").length !== 1 ? "s" : ""}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Edit3 className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium">
                                                {shares.filter((s) => s.permission === "edit").length}
                                            </span>
                                            <span className="text-muted-foreground">Editor{shares.filter((s) => s.permission === "edit").length !== 1 ? "s" : ""}</span>
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
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
