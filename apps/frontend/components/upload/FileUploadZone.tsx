"use client";

import { useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { uploadToCloudinary, CloudinaryUploadResult } from '@/lib/cloudinary';
import { toast } from 'sonner';

interface FileUploadZoneProps {
    onUpload: (result: CloudinaryUploadResult) => void;
    accept?: string;
    folder?: string;
    maxFileSize?: number;
    allowedFormats?: string[];
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    description?: string;
}

export function FileUploadZone({
    onUpload,
    accept = 'image/*,video/*',
    folder = 'kaivo',
    maxFileSize = 100000000,
    allowedFormats,
    resourceType = 'auto',
    description = 'Drop your file here or click to browse'
}: FileUploadZoneProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = async (file: File) => {
        setUploading(true);
        setProgress(0);

        try {
            const progressInterval = setInterval(() => {
                setProgress((prev) => Math.min(prev + 10, 90));
            }, 200);

            const result = await uploadToCloudinary(file, {
                folder,
                resourceType,
                maxFileSize,
                allowedFormats,
            });

            clearInterval(progressInterval);
            setProgress(100);
            
            if (result) {
                onUpload(result);
                toast.success('File uploaded successfully!');
            }
        } catch (error: any) {
            toast.error(error?.message || 'Failed to upload file');
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    };

    const handleClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = (e: any) => {
            const file = e.target?.files?.[0];
            if (file) {
                handleFile(file);
            }
        };
        input.click();
    };

    return (
        <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer ${
                isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-300 dark:border-gray-700 hover:border-primary'
            } ${uploading ? 'pointer-events-none' : ''}`}
            onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            {uploading ? (
                <>
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
                    <p className="text-kaivo-text-primary font-medium mb-1">Uploading...</p>
                    {progress > 0 && (
                        <div className="w-full max-w-xs mx-auto mt-2">
                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-kaivo-text-primary font-medium mb-1">{description}</p>
                    <p className="text-sm text-kaivo-text-muted">
                        {allowedFormats
                            ? `Supports: ${allowedFormats.join(', ').toUpperCase()}`
                            : 'Drag and drop or click to select'}
                    </p>
                </>
            )}
        </div>
    );
}

interface UploadedFilePreviewProps {
    url: string;
    fileType: 'image' | 'video' | 'audio' | null;
    onRemove: () => void;
}

export function UploadedFilePreview({ url, fileType, onRemove }: UploadedFilePreviewProps) {
    return (
        <div className="relative group border border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-black/20 hover:border-primary/50 transition-all">
            <button
                onClick={onRemove}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/70 hover:bg-red-500/90 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100"
                type="button"
                aria-label="Remove asset"
            >
                <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center items-center bg-gradient-to-br from-gray-900/50 to-black/50 min-h-[400px]">
                {fileType === 'image' && (
                    <img 
                        src={url} 
                        alt="Creative asset" 
                        className="max-h-[500px] w-full object-contain" 
                    />
                )}
                {fileType === 'video' && (
                    <video 
                        src={url} 
                        controls 
                        className="max-h-[500px] w-full" 
                    />
                )}
                {fileType === 'audio' && (
                    <div className="p-12 w-full flex flex-col items-center max-w-md">
                        <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-6">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-primary"
                            >
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                            </svg>
                        </div>
                        <audio src={url} controls className="w-full" />
                    </div>
                )}
            </div>

            <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs font-medium text-green-400">Uploaded</span>
                </div>
            </div>
        </div>
    );
}
