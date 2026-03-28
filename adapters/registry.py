from typing import Dict, Type
from .base import BaseAdapter, AdapterConfig

class AdapterRegistry:
    _registry: Dict[str, Type[BaseAdapter]] = {}
    _instances: Dict[str, BaseAdapter] = {}

    @classmethod
    def register(cls, platform_name: str, adapter_cls: Type[BaseAdapter]):
        cls._registry[platform_name] = adapter_cls

    @classmethod
    def get(cls, platform_name: str) -> BaseAdapter:
        if platform_name not in cls._registry:
            raise ValueError(f"Adapter for {platform_name} not found")
        
        if platform_name not in cls._instances:
            # In a real app, we'd load config from env/secrets based on platform_name
            config = AdapterConfig(api_key="placeholder", api_secret="placeholder")
            cls._instances[platform_name] = cls._registry[platform_name](config)
        
        return cls._instances[platform_name]

    @classmethod
    def list_platforms(cls):
        return list(cls._registry.keys())
