"use client";

import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { ShareModal } from "./share-modal";

interface ShareButtonProps {
    projectId: string;
    projectName: string;
    isOwner: boolean;
}

export function ShareButton({ projectId, projectName, isOwner }: ShareButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!isOwner) return null;

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="gap-2"
            >
                <Share2 className="h-4 w-4" />
                Share
            </Button>

            <ShareModal
                projectId={projectId}
                projectName={projectName}
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
            />
        </>
    );
}
