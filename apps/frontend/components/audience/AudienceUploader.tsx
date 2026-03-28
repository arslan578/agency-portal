"use client";

import React, { useState } from 'react';
import { buttonVariants } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Upload, FileText, AlertTriangle, Loader2, Lock, Check, Table as TableIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useTranslation } from '@/context/LanguageContext';

import { apiClient as api } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils';
import { useCloudinaryUpload } from '@/lib/cloudinary';
import { useAgency } from '@/context/AgencyContext';
import { toast } from 'sonner';

export function AudienceUploader() {
    const { t } = useTranslation();
    const { currentClient } = useAgency();
    const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [rowCount, setRowCount] = useState<number | null>(null);
    const [showMapping, setShowMapping] = useState(false);
    const [audienceName, setAudienceName] = useState('');
    const { upload: uploadToCloudinary, uploading: cloudinaryUploading } = useCloudinaryUpload();
    const clientId = currentClient?.id ?? null;

    const handleCloudinaryUpload = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt';
        input.onchange = async (e: any) => {
            const file = e.target?.files?.[0];
            if (!file) return;

            try {
                const result = await uploadToCloudinary(file, {
                    folder: 'audiences',
                    resourceType: 'raw',
                    allowedFormats: ['csv', 'txt'],
                    maxFileSize: 10000000,
                });
                if (result) {
                    setCloudinaryUrl(result.secure_url);
                    setShowMapping(true);
                    toast.success('CSV uploaded to Cloudinary!');
                }
            } catch (error) {
                toast.error('Failed to upload CSV');
            }
        };
        input.click();
    };

    const handleUpload = async () => {
        if (!cloudinaryUrl || !audienceName.trim()) {
            toast.error('Please upload a CSV file and enter an audience name');
            return;
        }
        if (!clientId) {
            toast.error('Please select a client first (use the client selector in the header).');
            return;
        }
        setUploading(true);
        setRowCount(null);
        try {
            const res = await api.post<{ audience_id: number; row_count: number; status: string }>(
                API_ENDPOINTS.AUDIENCE.UPLOAD,
                {
                    client_id: clientId,
                    name: audienceName.trim(),
                    cloudinary_url: cloudinaryUrl,
                }
            );
            setRowCount(typeof res?.row_count === 'number' ? res.row_count : null);
            setSuccess(true);
            toast.success('Audience uploaded and processed successfully!');
        } catch (error: unknown) {
            const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'Unknown error';
            toast.error(`Failed to upload audience: ${msg}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle>{t('audience.upload_title')}</CardTitle>
                    <CardDescription>{t('audience.upload_desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!clientId && (
                        <Alert className="bg-amber-500/10 border-amber-500/20">
                            <Lock className="h-4 w-4 text-amber-500" />
                            <AlertTitle className="text-amber-200">Select a client</AlertTitle>
                            <AlertDescription>
                                Use the client selector in the header to choose which client this audience belongs to, then upload your CSV.
                            </AlertDescription>
                        </Alert>
                    )}
                    {!success ? (
                        <>
                            {!cloudinaryUrl ? (
                                <div className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-primary/50 transition-all relative group">
                                    <button
                                        onClick={handleCloudinaryUpload}
                                        disabled={cloudinaryUploading}
                                        className="w-full h-full flex flex-col items-center"
                                    >
                                        <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                                            {cloudinaryUploading ? (
                                                <Loader2 className="h-7 w-7 text-primary animate-spin" />
                                            ) : (
                                                <Upload className="h-7 w-7 group-hover:text-primary transition-colors" />
                                            )}
                                        </div>
                                        {cloudinaryUploading ? (
                                            <span className="text-sm font-medium text-foreground">Uploading to Cloudinary...</span>
                                        ) : (
                                            <div className="text-center space-y-1">
                                                <span className="text-sm font-medium text-foreground">Click to upload</span>
                                                <p className="text-xs text-muted-foreground">CSV file</p>
                                            </div>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 text-primary font-medium bg-primary/10 px-4 py-2 rounded-full">
                                        <FileText className="h-4 w-4" />
                                        CSV uploaded to Cloudinary
                                    </div>
                                    <Input
                                        placeholder="Enter audience name"
                                        value={audienceName}
                                        onChange={(e) => setAudienceName(e.target.value)}
                                    />
                                </>
                            )}

                            {cloudinaryUrl && (
                                <Alert className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                                    <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    <AlertTitle className="text-blue-800 dark:text-blue-300">{t('audience.secure_hashing')}</AlertTitle>
                                    <AlertDescription className="text-blue-700 dark:text-blue-400">
                                        {t('audience.hashing_desc')}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-green-600 animate-in zoom-in duration-300">
                            <div className="h-20 w-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
                                <Check className="h-10 w-10" />
                            </div>
                            <h3 className="text-xl font-bold">{t('audience.upload_complete')}</h3>
                            <p className="text-muted-foreground">{t('audience.ready_msg')}</p>
                            {rowCount != null && (
                                <div className="mt-4 text-sm font-mono bg-muted px-3 py-1 rounded">
                                    Rows Processed: {rowCount.toLocaleString()}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
                {!success && cloudinaryUrl && (
                    <CardFooter>
                        <button onClick={handleUpload} disabled={!audienceName.trim() || uploading || !clientId} className={cn(buttonVariants(), "w-full h-11")}>
                            {uploading ? t('common.loading') : t('common.upload')}
                        </button>
                    </CardFooter>
                )}
            </Card>

            {/* Column Mapping Modal */}
            <Dialog open={showMapping} onOpenChange={setShowMapping}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <TableIcon className="h-5 w-5" />
                            Map Columns
                        </DialogTitle>
                        <DialogDescription>
                            Confirm the columns from your CSV file.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm font-medium text-muted-foreground mb-2">
                            <div>CSV Column</div>
                            <div>Kaivo Field</div>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4 items-center">
                                <div className="p-2 bg-muted rounded border text-sm">email_address</div>
                                <div className="flex items-center gap-2 text-sm text-green-600">
                                    <Check className="h-3 w-3" /> Email (SHA256)
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 items-center">
                                <div className="p-2 bg-muted rounded border text-sm">phone</div>
                                <div className="flex items-center gap-2 text-sm text-green-600">
                                    <Check className="h-3 w-3" /> Phone (SHA256)
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 items-center">
                                <div className="p-2 bg-muted rounded border text-sm">first_name</div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    Ignored
                                </div>
                            </div>
                        </div>

                        <Alert variant="default" className="mt-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>PII Protection</AlertTitle>
                            <AlertDescription>
                                Only Email and Phone columns will be hashed and uploaded. All other data is discarded locally.
                            </AlertDescription>
                        </Alert>
                    </div>

                    <DialogFooter>
                        <button className={cn(buttonVariants({ variant: "outline" }))} onClick={() => { setCloudinaryUrl(null); setShowMapping(false); }}>Cancel</button>
                        <button className={cn(buttonVariants())} onClick={() => setShowMapping(false)}>Confirm Mapping</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
