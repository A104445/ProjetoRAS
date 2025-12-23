"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface ValidateShareResponse {
    valid: boolean;
    permission: "view" | "edit";
    projectName: string;
    ownerName: string;
    reason?: string;
}

export default function ShareAccessPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [shareData, setShareData] = useState<ValidateShareResponse | null>(null);

    const shareId = params.shareId as string;
    const token = searchParams.get("token");

    useEffect(() => {
        if (!shareId || !token) {
            setError("Invalid share link");
            setLoading(false);
            return;
        }

        const validateShare = async () => {
            try {
                // Call the API Gateway route we are about to add
                const response = await api.get<ValidateShareResponse>(`/shares/${shareId}/validate`, {
                    params: { token }
                });

                if (response.data.valid) {
                    setShareData(response.data);
                } else {
                    setError(response.data.reason || "Invalid share link");
                }
            } catch (err) {
                console.error(err);
                setError("Failed to validate share link");
            } finally {
                setLoading(false);
            }
        };

        validateShare();
    }, [shareId, token]);

    const handleAccess = async () => {
        try {
            setLoading(true);

            // Get JWT from localStorage session
            const storedSession = localStorage.getItem("session");
            let jwtToken = "";
            if (storedSession) {
                try {
                    const session = JSON.parse(storedSession);
                    jwtToken = session?.token || "";
                } catch (e) {
                    console.error("Error parsing session:", e);
                }
            }

            if (!jwtToken) {
                toast({
                    title: "Error",
                    description: "Please login to access this project",
                    variant: "destructive",
                });
                router.push("/login");
                return;
            }

            const response = await api.post(
                `/shares/${shareId}/access`,
                { token }, // share token
                {
                    headers: {
                        Authorization: `Bearer ${jwtToken}`, // JWT token
                    },
                }
            );

            if (response.data && response.data.projectData) {
                const projectId = response.data.projectData._id;
                router.push(`/dashboard/${projectId}`);
            } else {
                router.push("/dashboard");
            }

        } catch (err) {
            console.error("Access error:", err);
            toast({
                title: "Error",
                description: "Failed to access project",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="text-destructive">Invalid Share Link</CardTitle>
                        <CardDescription>
                            The link you are trying to access is invalid or expired.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p>{error}</p>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={() => router.push("/")} className="w-full">
                            Go Home
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Join Project</CardTitle>
                    <CardDescription>
                        You have been invited to collaborate on a project.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm font-medium text-muted-foreground">Project</p>
                        <p className="text-lg font-semibold">{shareData?.projectName}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Owner</p>
                        <p>{shareData?.ownerName}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Permission</p>
                        <p className="capitalize">{shareData?.permission}</p>
                    </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push("/")} className="flex-1">
                        Cancel
                    </Button>
                    <Button onClick={handleAccess} className="flex-1">
                        Access Project
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
