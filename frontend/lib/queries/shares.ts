
import { useQuery } from "@tanstack/react-query";
import { getProjectShares, getSharedWithMe } from "../shares";
import { SessionData } from "../session";

export const useProjectShares = (projectId: string) => {
    return useQuery({
        queryKey: ["shares", "project", projectId],
        queryFn: () => {
            const session = JSON.parse(
                localStorage.getItem("session")!,
            ) as SessionData;

            return getProjectShares({
                projectId,
                userId: session.user._id,
                token: session.token,
            });
        },
        enabled: !!projectId,
        staleTime: 30 * 1000, // 30 seconds
    });
};

export const useSharedProjects = () => {
    return useQuery({
        queryKey: ["shares", "sharedWithMe"],
        queryFn: () => {
            const session = JSON.parse(
                localStorage.getItem("session")!,
            ) as SessionData;

            return getSharedWithMe({
                userId: session.user._id,
                token: session.token,
            });
        },
        staleTime: 30 * 1000, // 30 seconds
    });
};
