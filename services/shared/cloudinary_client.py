"""
Cloudinary Client for Media Storage
"""
import cloudinary
import cloudinary.uploader
import cloudinary.api
from typing import BinaryIO, Optional
import os
from urllib.parse import urlparse
import logging

logger = logging.getLogger(__name__)


class CloudinaryClient:
    """Client for Cloudinary storage operations"""
    
    def __init__(self):
        try:
            cloudinary.config(
                cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
                api_key=os.getenv('CLOUDINARY_API_KEY'),
                api_secret=os.getenv('CLOUDINARY_API_SECRET')
            )
            self.cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
            if not self.cloud_name:
                raise ValueError("CLOUDINARY_CLOUD_NAME not set")
        except Exception as e:
            logger.info(f"Cloudinary Client not configured: {e}")
            self.cloud_name = None
    
    def upload(
        self, 
        file_obj: BinaryIO, 
        filename: str, 
        resource_type: str = "auto",
        folder: Optional[str] = None,
        **kwargs
    ) -> dict:
        """
        Upload file to Cloudinary and return upload result
        """
        if not self.cloud_name:
            raise Exception("Cloudinary not configured")
        
        folder_path = folder if folder else "kaivo"
        
        if resource_type == "auto":
            ext = filename.split('.')[-1].lower() if '.' in filename else ''
            if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']:
                resource_type = "image"
            elif ext in ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv']:
                resource_type = "video"
            elif ext in ['mp3', 'wav', 'ogg', 'aac', 'm4a']:
                resource_type = "video"
            else:
                resource_type = "raw"
        
        try:
            result = cloudinary.uploader.upload(
                file_obj,
                folder=folder_path,
                resource_type=resource_type,
                use_filename=True,
                unique_filename=True,
                **kwargs
            )
            return result
        except Exception as e:
            raise Exception(f"Failed to upload to Cloudinary: {str(e)}")
    
    def upload_from_url(self, url: str, folder: Optional[str] = None, **kwargs) -> dict:
        """
        Upload file from URL to Cloudinary
        """
        if not self.cloud_name:
            raise Exception("Cloudinary not configured")
        
        folder_path = folder if folder else "kaivo"
        
        try:
            result = cloudinary.uploader.upload(
                url,
                folder=folder_path,
                **kwargs
            )
            return result
        except Exception as e:
            raise Exception(f"Failed to upload from URL to Cloudinary: {str(e)}")
    
    def get_url(self, public_id: str, resource_type: str = "image", **transformations) -> str:
        """
        Get Cloudinary URL for a public_id with optional transformations
        """
        if not self.cloud_name:
            raise Exception("Cloudinary not configured")
        
        try:
            url = cloudinary.CloudinaryImage(public_id).build_url(**transformations)
            return url
        except Exception as e:
            raise Exception(f"Failed to generate Cloudinary URL: {str(e)}")
    
    def delete(self, public_id: str, resource_type: str = "image") -> bool:
        """
        Delete file from Cloudinary
        """
        if not self.cloud_name:
            raise Exception("Cloudinary not configured")
        
        try:
            result = cloudinary.uploader.destroy(public_id, resource_type=resource_type)
            return result.get('result') == 'ok'
        except Exception as e:
            raise Exception(f"Failed to delete from Cloudinary: {str(e)}")
    
    def fetch_content(self, url: str) -> bytes:
        """
        Fetch file content from Cloudinary URL
        """
        import httpx
        try:
            response = httpx.get(url, timeout=30.0)
            response.raise_for_status()
            return response.content
        except Exception as e:
            raise Exception(f"Failed to fetch content from Cloudinary URL: {str(e)}")
    
    def extract_public_id(self, url: str) -> Optional[str]:
        """
        Extract public_id from Cloudinary URL
        """
        try:
            parsed = urlparse(url)
            if 'cloudinary.com' not in parsed.netloc:
                return None
            
            path_parts = parsed.path.strip('/').split('/')
            if len(path_parts) >= 2:
                public_id_with_format = '/'.join(path_parts[1:])
                if '.' in public_id_with_format:
                    public_id = '.'.join(public_id_with_format.split('.')[:-1])
                else:
                    public_id = public_id_with_format
                return public_id
            return None
        except Exception as e:
            logger.warning(f"Could not extract public_id from URL {url}: {e}")
            return None


cloudinary_client = CloudinaryClient()
