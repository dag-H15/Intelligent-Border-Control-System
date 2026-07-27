import unittest
import json
from app import app

class TestAIService(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health(self):
        res = self.client.get('/health')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get('status'), 'ok')

    def test_verify_simulation(self):
        payload = {
            "travelerId": 1,
            "captureMode": "SIMULATION",
            "fingerprintImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "irisImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "referenceFingerprint": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "referenceIris": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "threshold": 95.0
        }
        res = self.client.post('/verify', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('fingerprintScore', data)
        self.assertIn('irisScore', data)
        self.assertIn('finalScore', data)
        self.assertIn('decision', data)

    def test_verify_scanner(self):
        payload = {
            "travelerId": 2,
            "captureMode": "SCANNER",
            "fingerprintData": "scanner-fingerprint-10001",
            "irisData": "scanner-iris-10001",
            "referenceFingerprint": "fingerprint-template-FAN-100001",
            "referenceIris": "iris-template-FAN-100001",
            "threshold": 90.0
        }
        res = self.client.post('/verify', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('fingerprintScore', data)
        self.assertIn('irisScore', data)
        self.assertIn('finalScore', data)
        self.assertIn('decision', data)

if __name__ == '__main__':
    unittest.main()
