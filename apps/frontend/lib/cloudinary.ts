"use client";

import { useState, useCallback } from 'react';

export interface CloudinaryUploadResult {
    url: string;
    secure_url: string;
    public_id: string;
    format: string;
    resource_type: string;
    width?: number;
    height?: number;
    bytes: number;
}

export interface CloudinaryUploadOptions {
    folder?: string;
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    maxFileSize?: number;
    allowedFormats?: string[];
}

export async function uploadToCloudinary(
    file: File,
    options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'db113fcll';
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'kaivoapp';

    if (!cloudName || !uploadPreset) {
        throw new Error('Cloudinary configuration missing. Please set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET');
    }

    if (options.maxFileSize && file.size > options.maxFileSize) {
        throw new Error(`File size exceeds maximum of ${(options.maxFileSize / 1000000).toFixed(0)}MB`);
    }

    if (options.allowedFormats) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (fileExtension && !options.allowedFormats.includes(fileExtension)) {
            throw new Error(`File format .${fileExtension} not allowed. Allowed: ${options.allowedFormats.join(', ')}`);
        }
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    
    if (options.folder) {
        formData.append('folder', options.folder);
    }

    let resourceType = options.resourceType || 'auto';
    if (resourceType === 'auto') {
        const fileType = file.type.toLowerCase();
        if (fileType.startsWith('image/')) {
            resourceType = 'image';
        } else if (fileType.startsWith('video/')) {
            resourceType = 'video';
        } else {
            resourceType = 'raw';
        }
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

    const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Upload failed');
    }

    const result = await response.json();

    return {
        url: result.url,
        secure_url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        resource_type: result.resource_type,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
    };
}

export function useCloudinaryUpload() {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [progress, setProgress] = useState(0);

    const upload = useCallback(
        async (file: File, options: CloudinaryUploadOptions = {}): Promise<CloudinaryUploadResult | null> => {
            setUploading(true);
            setError(null);
            setProgress(0);

            try {
                const progressInterval = setInterval(() => {
                    setProgress((prev) => Math.min(prev + 10, 90));
                }, 200);

                const result = await uploadToCloudinary(file, options);
                
                clearInterval(progressInterval);
                setProgress(100);
                setUploading(false);
                
                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error('Upload failed');
                setError(error);
                setUploading(false);
                setProgress(0);
                return null;
            }
        },
        []
    );

    return {
        upload,
        uploading,
        error,
        progress,
    };
}
