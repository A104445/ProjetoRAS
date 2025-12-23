"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, ArrowLeft, Search, FileQuestion } from "lucide-react";

export default function NotFound() {
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
                        <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                            <FileQuestion className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-4xl font-bold">404</CardTitle>
                        <p className="text-xl text-muted-foreground">Page Not Found</p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <p className="text-muted-foreground">
                            Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button asChild variant="default" size="lg">
                                <Link href="/" className="inline-flex items-center">
                                    <Home className="mr-2 h-4 w-4" />
                                    Go Home
                                </Link>
                            </Button>
                            <Button asChild variant="outline" size="lg">
                                <Link href="/dashboard" className="inline-flex items-center">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Dashboard
                                </Link>
                            </Button>
                        </div>

                        <div className="pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                                Need help?{" "}
                                <Link href="/" className="text-primary hover:underline">
                                    Contact support
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
