import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { badRequest, internalError, unauthorized } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/lib/constants/pagination";

const logger = createLogger("api:practice:saved");

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return unauthorized("Authentication required");
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(MIN_PAGE_SIZE, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10))
    );

    try {
        const where = {
            userId: session.user.id,
        };

        const total = await prisma.savedPracticeQuestion.count({ where });
        const items = await prisma.savedPracticeQuestion.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });

        return NextResponse.json({
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        logger.error({ error }, "Error fetching saved practice questions");
        return internalError("Failed to fetch saved practice questions");
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return unauthorized("Authentication required");
    }

    try {
        const { errorItemId, difficulty, question } = await req.json();

        if (!question?.questionText || !question?.answerText || !question?.analysis) {
            return badRequest("Missing required practice question fields");
        }

        if (errorItemId) {
            const sourceItem = await prisma.errorItem.findFirst({
                where: {
                    id: errorItemId,
                    userId: session.user.id,
                },
                select: { id: true },
            });

            if (!sourceItem) {
                return badRequest("Source error item not found");
            }
        }

        const saved = await prisma.savedPracticeQuestion.create({
            data: {
                userId: session.user.id,
                errorItemId: errorItemId || null,
                difficulty: difficulty || null,
                questionText: question.questionText,
                answerText: question.answerText,
                analysis: question.analysis,
                subject: question.subject || null,
                knowledgePoints: JSON.stringify(question.knowledgePoints || []),
                requiresImage: Boolean(question.requiresImage),
            },
        });

        return NextResponse.json(saved);
    } catch (error) {
        logger.error({ error }, "Error saving practice question");
        return internalError("Failed to save practice question");
    }
}
