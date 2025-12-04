import { api } from "./axios";
import { ProjectTool } from "./projects";

export interface Preset {
    _id: string;
    user_id: string;
    name: string;
    tools: ProjectTool[];
    created_at: string;
}

export const fetchPresets = async (uid: string, token: string) => {
    const response = await api.get<Preset[]>(`/projects/presets/${uid}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status !== 200 || !response.data)
        throw new Error("Failed to fetch presets");

    return response.data;
};

export const createPreset = async (
    uid: string,
    token: string,
    name: string,
    tools: ProjectTool[],
) => {
    const response = await api.post<Preset>(
        `/projects/presets/${uid}`,
        {
            name,
            tools,
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    );

    if (response.status !== 201 || !response.data)
        throw new Error("Failed to create preset");

    return response.data;
};

export const updatePreset = async (
    uid: string,
    presetId: string,
    token: string,
    data: Partial<Preset>,
) => {
    const response = await api.put(
        `/projects/presets/${uid}/${presetId}`,
        data,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    );

    if (response.status !== 204) throw new Error("Failed to update preset");
};

export const deletePreset = async (
    uid: string,
    presetId: string,
    token: string,
) => {
    const response = await api.delete(`/projects/presets/${uid}/${presetId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status !== 204) throw new Error("Failed to delete preset");
};
