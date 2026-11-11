import unittest
from starlette.testclient import TestClient
from backend.main import app

class TestBackendApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_root_and_health(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "online")

        res_health = self.client.get("/health")
        self.assertEqual(res_health.status_code, 200)
        self.assertEqual(res_health.json()["status"], "ok")

    def test_demo_login_and_me(self):
        res = self.client.post("/api/auth/demo")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertIn("username", data)
        self.assertIn("email", data)
        self.assertIn("tranche_session", res.cookies)

        # Access /api/auth/me with session cookie
        res_me = self.client.get("/api/auth/me", cookies=res.cookies)
        self.assertEqual(res_me.status_code, 200)
        self.assertEqual(res_me.json()["data"]["email"], data["email"])

    def test_login_invalid(self):
        res = self.client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["error"]["code"], "UNAUTHENTICATED")

    def test_login_valid(self):
        res = self.client.post("/api/auth/login", json={"email": "demo@tranche.finance", "password": "tranche2026"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["data"]["email"], "demo@tranche.finance")
        self.assertIn("tranche_session", res.cookies)

    def test_tranche_group(self):
        res = self.client.get("/api/tranche/group")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertIn("id", data)
        self.assertIn("members", data)
        self.assertIn("rounds", data)

    def test_tranche_ledger(self):
        res = self.client.get("/api/tranche/ledger")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertIn("contributions", data)
        self.assertIn("roundMembers", data)

    def test_tranche_vault(self):
        res = self.client.get("/api/tranche/vault")
        self.assertEqual(res.status_code, 200)

    def test_contract_signatures_lifecycle(self):
        # Reset signatures first
        res_del = self.client.delete("/api/tranche/contract/signatures?groupId=test-group")
        self.assertEqual(res_del.status_code, 200)

        # Post signature
        res_post = self.client.post("/api/tranche/contract/signatures", json={
            "groupId": "test-group",
            "signatoryId": "m1",
            "name": "Member 1",
            "type": "typed",
            "signatureData": "Member 1",
            "termsAccepted": True
        })
        self.assertEqual(res_post.status_code, 200)
        self.assertIn("m1", res_post.json()["data"])

        # Fetch signatures
        res_get = self.client.get("/api/tranche/contract/signatures?groupId=test-group")
        self.assertEqual(res_get.status_code, 200)
        self.assertIn("m1", res_get.json()["data"])
        self.assertEqual(res_get.json()["data"]["m1"]["name"], "Member 1")

if __name__ == "__main__":
    unittest.main()
