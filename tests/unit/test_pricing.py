import unittest
from services.intelligence_service.pricing import calculate_effective_cpm
from packages.shared.constants import KAIVO_CPM_MARKUP

class TestPricing(unittest.TestCase):
    def test_calculate_effective_cpm(self):
        raw_cpm = 10.00
        expected_cpm = 15.00 # 10.00 * 1.50
        
        effective_cpm = calculate_effective_cpm(raw_cpm)
        
        self.assertEqual(effective_cpm, expected_cpm)
        self.assertEqual(KAIVO_CPM_MARKUP, 1.50)

if __name__ == '__main__':
    unittest.main()
