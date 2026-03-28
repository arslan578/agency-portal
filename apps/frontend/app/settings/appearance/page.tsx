'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useTheme } from 'next-themes';

export default function AppearanceSettingsPage() {
    const { theme } = useTheme();

    return (
        <div className="space-y-6">

            <Card>
                <CardHeader>
                    <CardTitle>Theme</CardTitle>
                    <CardDescription>
                        Select your preferred color theme. Changes are applied immediately.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label>Color Theme</Label>
                            <p className="text-sm text-muted-foreground">
                                Switch between dark and light modes. The system theme option will automatically match your device settings.
                            </p>
                        </div>
                        <ThemeToggle />
                    </div>
                    {theme && (
                        <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
                            <p className="text-sm text-muted-foreground">
                                Current theme: <span className="font-medium text-foreground capitalize">{theme}</span>
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Preferences</CardTitle>
                    <CardDescription>
                        Additional display preferences and settings.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        More appearance customization options will be available in future updates.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
