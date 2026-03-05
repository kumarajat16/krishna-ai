import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getKrishnaReply } from "@/lib/krishna";

const { validateRequest } = twilio;

export async function POST(req: NextRequest) {
  try {
    // Parse Twilio's URL-encoded form body
    const body = await req.text();
    const params = Object.fromEntries(new URLSearchParams(body));

    // Validate Twilio signature in production
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const signature = req.headers.get("x-twilio-signature") || "";
      const url = req.url;

      if (!validateRequest(authToken, signature, url, params)) {
        return new NextResponse("Unauthorized", { status: 403 });
      }
    }

    const incomingMessage = params.Body || "";
    const from = params.From || "";

    if (!incomingMessage.trim()) {
      return twimlResponse("Parth, kuch toh likh... main sunn raha hoon.");
    }

    console.log(`WhatsApp message from ${from}: ${incomingMessage}`);

    // Send to Krishna AI (single-turn for now)
    const reply = await getKrishnaReply(
      [{ role: "user", content: incomingMessage }],
      300 // shorter max tokens for WhatsApp
    );

    const finalReply =
      reply || "Parth, abhi main samajh nahi paaya. Ek baar phir se bata.";

    return twimlResponse(finalReply);
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return twimlResponse(
      "Parth, abhi kuch gadbad ho gayi. Thodi der baad phir try kar."
    );
  }
}

function twimlResponse(message: string): NextResponse {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
