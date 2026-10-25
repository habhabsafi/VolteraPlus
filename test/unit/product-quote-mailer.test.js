const test = require("node:test");
const assert = require("node:assert/strict");
const { sendProductQuoteEmails } = require("../../src/mailer");

test("product quote emails notify Abe and confirm receipt to the customer from no-reply", async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.MAIL_FROM;
  const previousFetch = global.fetch;
  const messages = [];
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.MAIL_FROM = "noreply@example.test";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    messages.push(JSON.parse(options.body));
    return { ok: true };
  };

  try {
    const result = await sendProductQuoteEmails({
      name: "Quote Customer",
      email: "customer@example.test",
      phone: "613-555-0101",
      items: [{ title: "Digital Multimeter", quantity: 2 }],
      message: "Please include delivery details.",
    }, { name: "Voltera Plus", phone: "613-555-0100" });

    assert.deepEqual(result, { sent: true, error: "" });
    assert.deepEqual(messages.map((message) => message.to), [
      ["abe@volteraplus.ca"],
      ["customer@example.test"],
    ]);
    assert.ok(messages.every((message) => message.from.includes("noreply@example.test")));
    assert.equal(messages[0].reply_to, '"Quote Customer" <customer@example.test>');
    assert.match(messages[0].text, /Digital Multimeter x 2/);
    assert.match(messages[0].text, /Please include delivery details/);
    assert.match(messages[1].text, /We received your quote request/);
    assert.match(messages[1].text, /Digital Multimeter x 2/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = previousFrom;
    global.fetch = previousFetch;
  }
});
