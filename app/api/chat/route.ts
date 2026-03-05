import { NextRequest, NextResponse } from "next/server";
import { getKrishnaReply } from "@/lib/krishna";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const reply = await getKrishnaReply(messages);

  return NextResponse.json({ reply });
}
