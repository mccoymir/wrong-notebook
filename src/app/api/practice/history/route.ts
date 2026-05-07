import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return unauthorized();

  try {
    // @ts-ignore
    const userId = session.user.id;
    const records = await prisma.practiceRecord.findMany({
      where: { userId, questionText: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(records);
  } catch {
    return internalError("Failed to fetch practice history");
  }
}
