import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    useDeletePreset,
    useGetPresets,
    useUpdatePreset,
} from "@/lib/mutations/presets";
import {
    useClearProjectTools,
    useReorderProjectTools,
    usePreviewProjectResult,
} from "@/lib/mutations/projects";
import {
    useCurrentImage,
    usePreview,
    useProjectInfo,
} from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import {
    Eye,
    Filter,
    LoaderCircle,
    Play,
    Save,
    Share2,
    Trash2,
} from "lucide-react";
import { useState } from "react";
import { SavePresetDialog } from "./save-preset-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Preset } from "@/lib/presets";
import { Label } from "@/components/ui/label";

export function PresetList() {
    const session = useSession();
    const project = useProjectInfo();
    const currentImage = useCurrentImage();
    const previewState = usePreview();
    const { data: presets, isLoading, refetch } = useGetPresets(
        session.user._id,
        session.token,
    );
    const deletePreset = useDeletePreset();
    const updatePreset = useUpdatePreset();
    const clearTools = useClearProjectTools(
        session.user._id,
        project._id,
        session.token,
    );
    const reorderTools = useReorderProjectTools(
        session.user._id,
        project._id,
        session.token,
    );
    const previewMutation = usePreviewProjectResult();
    const { toast } = useToast();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingPreset, setEditingPreset] = useState<Preset | null>(null);

    // Share preset - copy link to clipboard
    const handleShare = (preset: Preset) => {
        const shareUrl = `${window.location.origin}/preset/${preset._id}`;
        navigator.clipboard.writeText(shareUrl);
        toast({
            title: "Link copied",
            description: "Preset link has been copied to clipboard.",
        });
    };

    // Apply preset - replaces all current tools with preset tools
    const handleApply = async (preset: Preset) => {
        try {
            // First clear existing tools
            if (project.tools.length > 0) {
                await clearTools.mutateAsync({
                    uid: session.user._id,
                    pid: project._id,
                    token: session.token,
                    toolIds: project.tools.map((t) => t._id),
                });
            }

            // Then apply preset tools using reorder
            if (preset.tools.length > 0) {
                await reorderTools.mutateAsync({
                    uid: session.user._id,
                    pid: project._id,
                    token: session.token,
                    tools: preset.tools.map((tool, idx) => ({
                        ...tool,
                        position: idx,
                    })),
                });
            }

            toast({
                title: "Preset applied",
                description: `"${preset.name}" has been applied to your project.`,
            });
        } catch {
            toast({
                title: "Error applying preset",
                description: "Failed to apply preset. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Preview preset
    const handlePreview = async (preset: Preset) => {
        if (!currentImage) {
            toast({
                title: "No image selected",
                description: "Please select an image to preview the preset.",
                variant: "destructive",
            });
            return;
        }

        try {
            // First clear existing tools
            if (project.tools.length > 0) {
                await clearTools.mutateAsync({
                    uid: session.user._id,
                    pid: project._id,
                    token: session.token,
                    toolIds: project.tools.map((t) => t._id),
                });
            }

            // Apply preset tools
            if (preset.tools.length > 0) {
                await reorderTools.mutateAsync({
                    uid: session.user._id,
                    pid: project._id,
                    token: session.token,
                    tools: preset.tools.map((tool, idx) => ({
                        ...tool,
                        position: idx,
                    })),
                });
            }

            // Request preview
            previewState.setWaiting(currentImage._id);
            await previewMutation.mutateAsync({
                uid: session.user._id,
                pid: project._id,
                imageId: currentImage._id,
                token: session.token,
            });

            toast({
                title: "Preview requested",
                description: `Previewing "${preset.name}" effect...`,
            });
        } catch {
            toast({
                title: "Error previewing preset",
                description: "Failed to preview preset. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Start inline name edit
    const handleEditStart = (preset: Preset) => {
        setEditingId(preset._id);
        setEditName(preset.name);
    };

    // Save inline name edit
    const handleEditSave = (presetId: string) => {
        if (!editName.trim()) return;
        updatePreset.mutate(
            {
                uid: session.user._id,
                presetId: presetId,
                token: session.token,
                data: { name: editName },
            },
            {
                onSuccess: () => {
                    setEditingId(null);
                    toast({ title: "Preset updated" });
                },
            },
        );
    };

    // Open edit dialog for filters
    const handleEditFilters = (preset: Preset) => {
        setEditingPreset(preset);
        setEditDialogOpen(true);
    };

    // Save filters from current project tools to preset
    const handleSaveFilters = () => {
        if (!editingPreset) return;

        updatePreset.mutate(
            {
                uid: session.user._id,
                presetId: editingPreset._id,
                token: session.token,
                data: {
                    tools: project.tools.map((tool, idx) => ({
                        position: idx,
                        procedure: tool.procedure,
                        params: tool.params,
                    })),
                },
            },
            {
                onSuccess: () => {
                    setEditDialogOpen(false);
                    setEditingPreset(null);
                    refetch();
                    toast({ title: "Preset filters updated" });
                },
                onError: () => {
                    toast({
                        title: "Error updating preset",
                        description: "Failed to save filters.",
                        variant: "destructive",
                    });
                },
            },
        );
    };

    // Delete preset
    const handleDelete = (presetId: string) => {
        deletePreset.mutate(
            {
                uid: session.user._id,
                presetId: presetId,
                token: session.token,
            },
            {
                onSuccess: () => {
                    toast({ title: "Preset deleted" });
                },
            },
        );
    };

    return (
        <>
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" title="My Filters">
                        <Filter className="size-4" />
                    </Button>
                </SheetTrigger>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>My Filters</SheetTitle>
                        <SheetDescription>
                            Manage and apply your saved tool configurations.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-4 flex flex-col gap-4">
                        <SavePresetDialog />

                        <div className="flex flex-col gap-2 mt-2">
                            {isLoading ? (
                                <div className="flex justify-center p-4">
                                    <LoaderCircle className="animate-spin" />
                                </div>
                            ) : presets?.length === 0 ? (
                                <p className="text-center text-sm text-muted-foreground">
                                    No presets found. Create one to get started!
                                </p>
                            ) : (
                                presets?.map((preset) => (
                                    <div
                                        key={preset._id}
                                        className="flex flex-col p-3 border rounded-md bg-card gap-2"
                                    >
                                        {editingId === preset._id ? (
                                            <div className="flex items-center gap-2 w-full">
                                                <Input
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="h-8"
                                                />
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleEditSave(preset._id)}
                                                    disabled={updatePreset.isPending}
                                                >
                                                    Save
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <span
                                                        className="font-medium truncate flex-1 cursor-pointer"
                                                        onClick={() => handleEditStart(preset)}
                                                        title="Click to rename"
                                                    >
                                                        {preset.name}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8"
                                                            onClick={() => handleShare(preset)}
                                                            title="Share Preset"
                                                        >
                                                            <Share2 className="size-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8 text-destructive hover:text-destructive"
                                                            onClick={() => handleDelete(preset._id)}
                                                            disabled={deletePreset.isPending}
                                                            title="Delete Preset"
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="flex-1 gap-1"
                                                        onClick={() => handleApply(preset)}
                                                        disabled={
                                                            clearTools.isPending || reorderTools.isPending
                                                        }
                                                        title="Apply Preset"
                                                    >
                                                        <Play className="size-3" />
                                                        Apply
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex-1 gap-1"
                                                        onClick={() => handlePreview(preset)}
                                                        disabled={
                                                            previewMutation.isPending ||
                                                            !currentImage ||
                                                            clearTools.isPending
                                                        }
                                                        title="Preview Preset"
                                                    >
                                                        <Eye className="size-3" />
                                                        Preview
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-1"
                                                        onClick={() => handleEditFilters(preset)}
                                                        title="Update filters from current tools"
                                                    >
                                                        <Save className="size-3" />
                                                    </Button>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {preset.tools.length} filter(s)
                                                </p>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Edit Filters Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Update Preset Filters</DialogTitle>
                        <DialogDescription>
                            Save your current tool configuration to this preset.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Preset: {editingPreset?.name}</Label>
                        <p className="text-sm text-muted-foreground mt-2">
                            This will replace the preset&apos;s {editingPreset?.tools.length}{" "}
                            filter(s) with your current {project.tools.length} filter(s):
                        </p>
                        <ul className="text-sm mt-2 list-disc pl-4">
                            {project.tools.map((tool) => (
                                <li key={tool._id}>{tool.procedure}</li>
                            ))}
                        </ul>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveFilters}
                            disabled={updatePreset.isPending}
                        >
                            {updatePreset.isPending && (
                                <LoaderCircle className="mr-2 size-4 animate-spin" />
                            )}
                            Save Filters
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
