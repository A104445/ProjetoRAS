import { api } from "./axios";

export interface Share {
    shareId: string;
    projectId: string;
    permission: "view" | "edit";
    token: string;
    createdAt: string;
    expiresAt: string | null;
    accessCount: number;
    lastAccessedAt: string | null;
    isActive: boolean;
}

export interface CreateShareResponse {
    shareId: string;
    shareUrl: string;
    token: string;
    expiresAt: string | null;
}

export interface ShareListResponse {
    shares: Share[];
    totalCount: number;
}

// Create share
export const createShare = async ({
    projectId,
    permission,
    expiresIn,
    userId,
    token,
}: {
    projectId: string;
    permission: "view" | "edit";
    expiresIn?: number;
    userId: string;
    token: string;
}) => {
    // Note: projectId is now in the URL
    const response = await api.post<CreateShareResponse>(
        `/projects/${projectId}/shares`,
        {
            projectId, // valid to keep it in body too, though URL is primary
            permission,
            expiresIn,
            userId,
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    if (response.status !== 201 || !response.data)
        throw new Error("Failed to create share");

    return response.data;
};

// Get project shares
export const getProjectShares = async ({
    projectId,
    userId,
    token,
}: {
    projectId: string;
    userId: string;
    token: string;
}) => {
    const response = await api.get<ShareListResponse>(
        `/projects/${projectId}/shares?userId=${userId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    if (response.status !== 200 || !response.data)
        throw new Error("Failed to fetch shares");

    return response.data;
};

// Revoke share
export const revokeShare = async ({
    shareId,
    projectId, // Added projectId requirement
    userId,
    token,
}: {
    shareId: string;
    projectId: string;
    userId: string;
    token: string;
}) => {
    const response = await api.delete(`/projects/${projectId}/shares/${shareId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        data: {
            userId,
        },
    });

    if (response.status !== 200)
        throw new Error("Failed to revoke share");

    return response.data;
};

// Validate share (for future use when accessing shared projects)
export const validateShare = async ({
    shareId,
    token,
}: {
    shareId: string;
    token: string;
}) => {
    const response = await api.get(
        `/shares/${shareId}/validate?token=${token}`
    );

    if (response.status !== 200 || !response.data)
        throw new Error("Failed to validate share");

    return response.data;
};

// Get projects shared with current user
export interface SharedProject {
    shareId: string;
    projectId: string;
    projectName: string;
    permission: "view" | "edit";
    ownerId: string;
    firstAccessed: string;
    lastAccessed: string;
    accessCount: number;
}

export interface SharedProjectsResponse {
    shares: SharedProject[];
    totalCount: number;
}

// Get shares for current user
export const getSharedWithMe = async ({
    userId,
    token,
}: {
    userId: string;
    token: string;
}) => {
    const response = await api.get<SharedProjectsResponse>(
        `/shares/user/me?userId=${userId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    if (response.status !== 200 || !response.data)
        throw new Error("Failed to fetch shared projects");

    return response.data;
};
