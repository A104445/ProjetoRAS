import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePreset } from "@/lib/mutations/presets";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { LoaderCircle, Save } from "lucide-react";

export function SavePresetDialog() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const project = useProjectInfo();
    const session = useSession();
    const createPreset = useCreatePreset();
    const { toast } = useToast();

    const handleSave = () => {
        if (!name.trim()) return;

        createPreset.mutate(
            {
                uid: session.user._id,
                token: session.token,
                name: name,
                tools: project.tools,
            },
            {
                onSuccess: () => {
                    setOpen(false);
                    setName("");
                    toast({
                        title: "Preset saved",
                        description: `Preset "${name}" has been saved successfully.`,
                    });
                },
                onError: (error) => {
                    toast({
                        title: "Error saving preset",
                        description: error.message,
                        variant: "destructive",
                    });
                },
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                    <Save className="size-4" />
                    Create New Preset
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Save Preset</DialogTitle>
                    <DialogDescription>
                        Save your current tool configuration as a preset to use later.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            Name
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3"
                            placeholder="My Awesome Filter"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={createPreset.isPending || !name.trim()}>
                        {createPreset.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
