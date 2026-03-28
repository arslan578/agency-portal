"use client";

export const runtime = 'edge';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Campaign } from '@/types/campaign';
import { Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { FileUploadZone, UploadedFilePreview } from '@/components/upload/FileUploadZone';
import { CloudinaryUploadResult } from '@/lib/cloudinary';

export default function CreativeUploadPage({ params }: { params: { id: string } }) {
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
    const [isReplacing, setIsReplacing] = useState(false);
    const [pendingReplaceUrl, setPendingReplaceUrl] = useState<string | null>(null);
    const [pendingReplaceType, setPendingReplaceType] = useState<'image' | 'video' | 'audio' | null>(null);
    const [uploading, setUploading] = useState(false);

    const { data: campaign, mutate } = useSWR<Campaign>(
        `/campaigns/${params.id}`,
        () => apiClient.get(API_ENDPOINTS.CAMPAIGN.DETAILS(params.id)),
        { revalidateOnFocus: true }
    );

    const handleConfirmDelete = async () => {
        setUploading(true);
        try {
            await apiClient.patch(`/campaign/campaigns/${params.id}`, {
                media_url: null,
                media_type: null,
            });
            
            toast.success('Creative asset removed!');
            setDeleteConfirmOpen(false);
            mutate();
        } catch (err: any) {
            toast.error(`Remove failed: ${err.message || 'Unknown error'}`);
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = () => {
        setDeleteConfirmOpen(true);
    };

    const handleReplaceClick = () => {
        setIsReplacing(true);
    };

    const handleUploadComplete = (result: CloudinaryUploadResult) => {
        let type: 'image' | 'video' | 'audio' = 'image';
        if (result.resource_type === 'image') type = 'image';
        else if (result.resource_type === 'video') type = 'video';
        else if (result.format && ['mp3', 'wav', 'ogg'].includes(result.format)) type = 'audio';
        
        setPendingReplaceUrl(result.secure_url);
        setPendingReplaceType(type);
        setReplaceConfirmOpen(true);
        setIsReplacing(false);
    };

    const handleConfirmReplace = async () => {
        if (!pendingReplaceUrl || !pendingReplaceType) return;
        
        setUploading(true);
        try {
            await apiClient.patch(`/campaign/campaigns/${params.id}`, {
                media_url: pendingReplaceUrl,
                media_type: pendingReplaceType,
            });

            toast.success('Creative asset replaced successfully!');
            setReplaceConfirmOpen(false);
            setPendingReplaceUrl(null);
            setPendingReplaceType(null);
            mutate();
        } catch (err: any) {
            toast.error(`Replace failed: ${err.message || 'Unknown error'}`);
        } finally {
            setUploading(false);
        }
    };

    const handleCancelReplace = () => {
        setReplaceConfirmOpen(false);
        setPendingReplaceUrl(null);
        setPendingReplaceType(null);
        setIsReplacing(false);
    };

    const handleInitialUpload = async (result: CloudinaryUploadResult) => {
        let type: 'image' | 'video' | 'audio' = 'image';
        if (result.resource_type === 'image') type = 'image';
        else if (result.resource_type === 'video') type = 'video';
        else if (result.format && ['mp3', 'wav', 'ogg'].includes(result.format)) type = 'audio';
        
        setUploading(true);
        try {
            await apiClient.patch(`/campaign/campaigns/${params.id}`, {
                media_url: result.secure_url,
                media_type: type,
            });
            toast.success('Creative asset saved successfully!');
            mutate();
        } catch (err: any) {
            toast.error(`Failed to save: ${err.message || 'Unknown error'}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        Create Ad Copy
                    </CardTitle>
                    <p className="text-sm text-gray-400">
                        Manage creative assets for {campaign?.name || 'this campaign'}
                    </p>
                </CardHeader>
                <CardContent className="space-y-6">
                    {campaign?.media_url && !isReplacing && !pendingReplaceUrl ? (
                        <div className="space-y-4">
                            <UploadedFilePreview
                                url={campaign.media_url}
                                fileType={campaign.media_type as any}
                                onRemove={handleRemove}
                            />
                            <div className="flex justify-center pt-2">
                                <Button
                                    variant="outline"
                                    onClick={handleReplaceClick}
                                    className="border-gray-300 dark:border-gray-700 hover:border-primary"
                                >
                                    Replace Asset
                                </Button>
                            </div>
                        </div>
                    ) : isReplacing ? (
                        <FileUploadZone
                            onUpload={handleUploadComplete}
                            folder="creative"
                            maxFileSize={100000000}
                            allowedFormats={['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav']}
                            description="Drop your new creative asset here"
                        />
                    ) : pendingReplaceUrl ? (
                        <div className="space-y-4">
                            <UploadedFilePreview
                                url={pendingReplaceUrl}
                                fileType={pendingReplaceType}
                                onRemove={handleCancelReplace}
                            />
                        </div>
                    ) : (
                        <FileUploadZone
                            onUpload={handleInitialUpload}
                            folder="creative"
                            maxFileSize={100000000}
                            allowedFormats={['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav']}
                            description="Drop your creative asset here"
                        />
                    )}
                </CardContent>
            </Card>

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Creative Asset</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove this creative asset? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setDeleteConfirmOpen(false)}
                            disabled={uploading}
                        >
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={uploading}
                        >
                            {uploading ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={replaceConfirmOpen} onOpenChange={setReplaceConfirmOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Replace Creative Asset</DialogTitle>
                        <DialogDescription>
                            Replace the current creative asset with the new one?
                        </DialogDescription>
                    </DialogHeader>
                    {pendingReplaceUrl && (
                        <div className="py-4">
                            <UploadedFilePreview 
                                url={pendingReplaceUrl} 
                                fileType={pendingReplaceType}
                                onRemove={handleCancelReplace}
                            />
                        </div>
                    )}
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={handleCancelReplace}
                            disabled={uploading}
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleConfirmReplace}
                            disabled={uploading}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            {uploading ? 'Replacing...' : 'Replace'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
