"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Pagination } from "@/components/ui/pagination";
import { apiClient } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { PaginatedResponse, SavedPracticeQuestion } from "@/types/api";

export const dynamic = "force-dynamic";

export default function SavedPracticePage() {
    const { t } = useLanguage();
    const [items, setItems] = useState<SavedPracticeQuestion[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const pageSize = 12;

    useEffect(() => {
        apiClient
            .get<PaginatedResponse<SavedPracticeQuestion>>(`/api/practice/saved?page=${page}&pageSize=${pageSize}`)
            .then((data) => {
                setItems(data.items);
                setTotal(data.total);
                setTotalPages(data.totalPages);
            })
            .catch((error) => {
                console.error("Failed to fetch saved practice questions:", error);
            });
    }, [page]);

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto p-4 space-y-6 pb-20">
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Bookmark className="h-5 w-5" />
                            <span>{t.app?.savedPractice || "Saved Practice"}</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                            {t.practice?.savedTitle || "Saved Practice"}
                        </h1>
                        <p className="text-muted-foreground">
                            {t.practice?.savedSubtitle || "Review the practice questions you decided to keep."}
                        </p>
                    </div>

                    <Link href="/">
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {t.common?.back || "Back"}
                        </Button>
                    </Link>
                </div>

                {items.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            {t.practice?.emptySaved || "No saved practice questions yet."}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {items.map((item) => {
                            const isExpanded = expandedIds.has(item.id);
                            let knowledgePoints: string[] = [];
                            if (item.knowledgePoints) {
                                try {
                                    knowledgePoints = JSON.parse(item.knowledgePoints) as string[];
                                } catch {
                                    knowledgePoints = [];
                                }
                            }

                            return (
                                <Card key={item.id} className="shadow-sm">
                                    <CardHeader className="space-y-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {item.subject && <Badge variant="secondary">{item.subject}</Badge>}
                                            {item.difficulty && (
                                                <Badge variant="outline">
                                                    {t.practice?.difficulty?.[item.difficulty as "easy" | "medium" | "hard" | "harder"] || item.difficulty}
                                                </Badge>
                                            )}
                                            <Badge variant="outline">
                                                {new Date(item.createdAt).toLocaleString()}
                                            </Badge>
                                        </div>
                                        <CardTitle className="text-lg leading-7">
                                            <MarkdownRenderer content={item.questionText} />
                                        </CardTitle>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        {knowledgePoints.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {knowledgePoints.map((point) => (
                                                    <Badge key={point} variant="secondary">
                                                        {point}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="outline" onClick={() => toggleExpanded(item.id)}>
                                                {isExpanded ? (
                                                    <>
                                                        <ChevronUp className="mr-2 h-4 w-4" />
                                                        {t.practice?.hideDetails || "Hide Answer & Analysis"}
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="mr-2 h-4 w-4" />
                                                        {t.practice?.showDetails || "Show Answer & Analysis"}
                                                    </>
                                                )}
                                            </Button>

                                            {item.errorItemId && (
                                                <Link href={`/error-items/${item.errorItemId}`}>
                                                    <Button variant="ghost">
                                                        <BookOpen className="mr-2 h-4 w-4" />
                                                        {t.practice?.viewSource || "View Source Error Item"}
                                                    </Button>
                                                </Link>
                                            )}
                                        </div>

                                        {isExpanded && (
                                            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                                                <div className="space-y-2">
                                                    <h2 className="font-semibold text-green-700">
                                                        {t.practice?.correctAnswer || "Correct Answer"}
                                                    </h2>
                                                    <MarkdownRenderer content={item.answerText} />
                                                </div>
                                                <div className="space-y-2">
                                                    <h2 className="font-semibold">
                                                        {t.practice?.detailedAnalysis || "Detailed Analysis"}
                                                    </h2>
                                                    <MarkdownRenderer content={item.analysis} />
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                <Pagination
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    total={total}
                    pageSize={pageSize}
                />
            </div>
        </main>
    );
}
