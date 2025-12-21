"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createShare, revokeShare } from "../shares";
import { SessionData } from "../session";
import { useToast } from "@/hooks/use-toast";

export const useCreateShare = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: ({
            projectId,
            permission,
            expiresIn,
        }: {
            projectId: string;
            permission: "view" | "edit";
            expiresIn?: number;
        }) => {
            const session = JSON.parse(
                localStorage.getItem("session")!,
            ) as SessionData;

            console.log("Creating share - Session:", session);
            console.log("Creating share - User ID:", session?.user?._id);

            if (!session?.user?._id) {
                throw new Error("User ID not found in session. Please try logging out and logging in again.");
            }

            return createShare({
                projectId,
                permission,
                expiresIn,
                userId: session.user._id,
                token: session.token,
            });
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["shares", "project", variables.projectId],
            });
            toast({
                title: "Share created",
                description: "Share link has been created successfully",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Error creating share",
                description: error.message,
                variant: "destructive",
            });
        },
    });
};

export const useRevokeShare = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: ({ shareId, projectId }: { shareId: string, projectId: string }) => {
            const session = JSON.parse(
                localStorage.getItem("session")!,
            ) as SessionData;

            return revokeShare({
                shareId,
                projectId,
                userId: session.user._id,
                token: session.token,
            });
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["shares", "project", variables.projectId],
            });
            toast({
                title: "Share revoked",
                description: "Share link has been revoked successfully",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Error revoking share",
                description: error.message,
                variant: "destructive",
            });
        },
    });
};
