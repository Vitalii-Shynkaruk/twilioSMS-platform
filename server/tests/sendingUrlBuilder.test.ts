import { describe, expect, it } from "vitest";
import { buildTwilioStatusCallbackUrl } from "../src/services/sendingUrlBuilder";

describe("buildTwilioStatusCallbackUrl", () => {
  it("builds status callback from base url without trailing slash", () => {
    expect(buildTwilioStatusCallbackUrl("https://api.sclcapital.io")).toBe(
      "https://api.sclcapital.io/api/webhooks/twilio/status",
    );
  });

  it("builds status callback from base url with trailing slash", () => {
    expect(buildTwilioStatusCallbackUrl("https://api.sclcapital.io/")).toBe(
      "https://api.sclcapital.io/api/webhooks/twilio/status",
    );
  });
});
