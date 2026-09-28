import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/auth";
export async function GET() { const user = await sessionUser(); return NextResponse.json({ authenticated: Boolean(user), user: user ? { name: user.name, email: user.email } : null }); }
