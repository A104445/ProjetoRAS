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
import { useCreateShare } from "@/lib/mutations/shares";
import { Copy, Check, Eye, Edit3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareModalProps {
    projectId: string;
    projectName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ShareModal({
    projectId,
    projectName,
    open,
    onOpenChange,
}: ShareModalProps) {
    const [permission, setPermission] = useState<"view" | "edit">("view");
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    const createShareMutation = useCreateShare();

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

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share "{projectName}"</DialogTitle>
                    <DialogDescription>
                        Create a shareable link with specific permissions
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
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
                </div>
            </DialogContent>
        </Dialog>
    );
}
