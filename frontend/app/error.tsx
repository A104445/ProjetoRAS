"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, RefreshCw, AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error("Application error:", error);
    }, [error]);

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b">
                <div className="flex justify-between items-center p-2 w-full">
                    <Link href="/" className="text-2xl font-bold font-title pt-1">
                        PictuRAS
                    </Link>
                </div>
            </header>

            <main className="flex-grow container mx-auto px-4 py-8 md:py-16 lg:py-24 flex items-center justify-center">
                <Card className="w-full max-w-lg text-center">
                    <CardHeader className="space-y-4">
                        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                            <AlertTriangle className="h-10 w-10 text-destructive" />
                        </div>
                        <CardTitle className="text-4xl font-bold">Oops!</CardTitle>
                        <p className="text-xl text-muted-foreground">Something went wrong</p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <p className="text-muted-foreground">
                            We encountered an unexpected error. Please try again or return to the home page.
                        </p>

                        {process.env.NODE_ENV === "development" && error.message && (
                            <div className="p-3 bg-muted rounded-lg text-left">
                                <p className="text-xs text-muted-foreground font-mono break-all">
                                    {error.message}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button onClick={reset} variant="default" size="lg">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Try Again
                            </Button>
                            <Button asChild variant="outline" size="lg">
                                <Link href="/" className="inline-flex items-center">
                                    <Home className="mr-2 h-4 w-4" />
                                    Go Home
                                </Link>
                            </Button>
                        </div>

                        <div className="pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                                If this problem persists,{" "}
                                <Link href="/" className="text-primary hover:underline">
                                    contact support
                                </Link>
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </main>

            <footer className="border-t py-6">
                <div className="container text-center text-sm text-muted-foreground">
                    © 2025 PictuRAS. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
