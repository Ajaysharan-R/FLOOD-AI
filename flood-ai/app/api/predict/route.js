import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rainfall = searchParams.get("rainfall");
  const slope = searchParams.get("slope");

  try {
    const backendRes = await fetch(
     `https://flood-ai-backend-bvqq.onrender.com/predict?rainfall=${rainfall}&slope=${slope}`
    );

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Backend not reachable" },
      { status: 500 }
    );
  }
}
