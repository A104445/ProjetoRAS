import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createPreset,
    deletePreset,
    fetchPresets,
    updatePreset,
} from "../presets";
import { ProjectTool } from "../projects";

export const useGetPresets = (uid: string, token: string) => {
    return useQuery({
        queryKey: ["presets", uid],
        queryFn: () => fetchPresets(uid, token),
    });
};

export const useCreatePreset = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            uid,
            token,
            name,
            tools,
        }: {
            uid: string;
            token: string;
            name: string;
            tools: ProjectTool[];
        }) => createPreset(uid, token, name, tools),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["presets", variables.uid] });
        },
    });
};

export const useUpdatePreset = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            uid,
            presetId,
            token,
            data,
        }: {
            uid: string;
            presetId: string;
            token: string;
            data: { name?: string; tools?: ProjectTool[] };
        }) => updatePreset(uid, presetId, token, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["presets", variables.uid] });
        },
    });
};

export const useDeletePreset = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            uid,
            presetId,
            token,
        }: {
            uid: string;
            presetId: string;
            token: string;
        }) => deletePreset(uid, presetId, token),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["presets", variables.uid] });
        },
    });
};
