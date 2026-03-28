import pytest
import asyncio
from adapters.base import BaseAdapter, AdapterConfig, with_retry, with_timeout

class MockAdapter(BaseAdapter):
    def __init__(self, config: AdapterConfig):
        super().__init__(config)
        self.fail_count = 0
        self.call_count = 0

    async def authenticate(self):
        return True

    async def estimate_plan(self, plan_details):
        pass

    async def launch_campaign(self, campaign_payload):
        pass

    async def fetch_reporting(self, campaign_id, start_date, end_date):
        pass

    async def validate_creative(self, creative_url, creative_type):
        pass

    @with_retry(retries=3, delay=0.01)
    async def flaky_method(self):
        self.call_count += 1
        if self.fail_count > 0:
            self.fail_count -= 1
            raise Exception("Simulated Network Error")
        return "success"

    @with_timeout(seconds=0.1)
    async def slow_method(self):
        await asyncio.sleep(0.2)
        return "success"

@pytest.mark.asyncio
async def test_adapter_retry_logic():
    config = AdapterConfig(api_key="test", api_secret="test")
    adapter = MockAdapter(config)
    adapter.fail_count = 2 # Fail twice, succeed on third
    
    # Should succeed eventually
    result = await adapter.flaky_method()
    assert result == "success"
    assert adapter.call_count == 3

@pytest.mark.asyncio
async def test_adapter_max_retries_exceeded():
    config = AdapterConfig(api_key="test", api_secret="test")
    adapter = MockAdapter(config)
    adapter.fail_count = 4 # Fail 4 times (more than retries=3)
    
    with pytest.raises(Exception):
        await adapter.flaky_method()
    assert adapter.call_count == 3 # Should stop after 3 attempts

@pytest.mark.asyncio
async def test_adapter_timeout():
    config = AdapterConfig(api_key="test", api_secret="test")
    adapter = MockAdapter(config)
    
    with pytest.raises(asyncio.TimeoutError):
        await adapter.slow_method()
