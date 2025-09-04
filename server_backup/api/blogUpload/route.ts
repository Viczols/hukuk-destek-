// NOT USED ANYMORE — client doğrudan Cloud Functions'a post ediyor (CORS).
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "disabled",
      message:
        "Use NEXT_PUBLIC_BLOG_UPLOAD_URL (Cloud Functions) instead of Next API route.",
    },
    { status: 405 }
  );
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}
