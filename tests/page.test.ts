import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/wallet", () => ({}));
const token = `pfk_${"a".repeat(64)}`;
const deployment = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("PAIFLOW_MODE", "team");
  vi.stubEnv("PAIFLOW_API_TOKEN", token);
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", deployment);
  vi.stubEnv("PAIFLOW_BASE_URL", "http://localhost:3000");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function screen() {
  const { default: Page } = await import("@/app/page");
  return renderToStaticMarkup(Page());
}
it.each(["team", "prepare", "demo", "invalid"])("home page shows the Ambagan hero without the starter checkout (%s)", async mode => {
  vi.stubEnv("PAIFLOW_MODE", mode);
  const html = await screen();
  expect(html).toContain("Ambagan");
  expect(html).not.toContain("<h2>Pay</h2>");
  expect(html).not.toContain("Live feed");
  expect(html).not.toContain(token);
  expect(fetchMock).not.toHaveBeenCalled();
});
