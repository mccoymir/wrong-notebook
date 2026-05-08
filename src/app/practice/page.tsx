"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle, Send, XCircle, ArrowLeft, House, ChevronLeft, ChevronRight, BookmarkPlus } from "lucide-react";
import { ParsedQuestion } from "@/lib/ai/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { apiClient } from "@/lib/api-client";
import { AppConfig } from "@/types/api";
import { frontendLogger } from "@/lib/frontend-logger";
import { ProgressFeedback, ProgressStatus } from "@/components/ui/progress-feedback";

export const dynamic = 'force-dynamic';

interface PracticeQuestion {
    originalId: string;
    question: ParsedQuestion;
    difficulty: "easy" | "medium" | "hard" | "harder";
    userAnswer?: string;
    notes?: string;
    isSubmitted?: boolean;
    isCorrect?: boolean | null;
    savedId?: string;
    isSaving?: boolean;
}

function PracticeContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const errorItemId = searchParams.get("id");
    const errorItemIds = searchParams.get("ids");
    const { t, language } = useLanguage();

    // 是否是批量模式
    const isBatchMode = !!errorItemIds;
    const idsArray = errorItemIds ? errorItemIds.split(",").filter(id => id.trim()) : [];

    // 批量模式状态
    const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [generatingAll, setGeneratingAll] = useState(false);

    // 单题模式状态（兼容旧模式）
    const [loading, setLoading] = useState(false);
    const [showAnswer, setShowAnswer] = useState(false);
    const [userAnswer, setUserAnswer] = useState("");
    const [notes, setNotes] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "harder">("medium");
    const [error, setError] = useState<string | null>(null);
    const [progressStatus, setProgressStatus] = useState<ProgressStatus>("idle");
    const [progress, setProgress] = useState<number | undefined>(undefined);

    useEffect(() => {
        apiClient.get<AppConfig>("/api/settings")
            .then(data => {
                setConfig(data);
            })
            .catch(err => console.error(err));
    }, []);

    // 生成单个题目（批量模式）
    const generateQuestionBatch = async (index: number) => {
        if (!isBatchMode || index >= idsArray.length) return;

        const id = idsArray[index];
        try {
            const data = await apiClient.post<any>("/api/practice/generate", {
                errorItemId: id,
                language,
                difficulty
            });

            setQuestions(prev => {
                const newQuestions = [...prev];
                    newQuestions[index] = {
                        originalId: id,
                        question: data,
                        difficulty,
                        userAnswer: "",
                        notes: "",
                        isSubmitted: false,
                        isCorrect: null,
                };
                return newQuestions;
            });
        } catch (err: any) {
            console.error(`Failed to generate for item ${id}:`, err);
            // 标记失败
            setQuestions(prev => {
                const newQuestions = [...prev];
                    newQuestions[index] = {
                        originalId: id,
                        question: { questionText: "生成失败，请重试", answerText: "", analysis: "", subject: "其他" } as ParsedQuestion,
                        difficulty,
                        userAnswer: "",
                        notes: "",
                        isSubmitted: false,
                        isCorrect: null,
                };
                return newQuestions;
            });
        }
    };

    // 批量生成所有题目
    const generateAllQuestions = async () => {
        if (!isBatchMode || idsArray.length === 0) return;

        setGeneratingAll(true);
        setError(null);
        setProgressStatus("analyzing");
        setProgress(0);

        // 初始化数组
        setQuestions(new Array(idsArray.length).fill(null));

        try {
            // 逐个生成（避免并发太高）
            for (let i = 0; i < idsArray.length; i++) {
                setCurrentIndex(i);
                setProgress(Math.round((i / idsArray.length) * 100));
                await generateQuestionBatch(i);
                setProgress(Math.round(((i + 1) / idsArray.length) * 100));
            }
        } finally {
            setGeneratingAll(false);
            setCurrentIndex(0);
            setProgressStatus("idle");
            setProgress(undefined);
        }
    };

    // 单题模式生成
    const generateQuestion = async () => {
        if (!errorItemId) return;

        setLoading(true);
        setError(null);
        setUserAnswer("");
        setNotes("");
        setIsSubmitted(false);
        setIsCorrect(null);
        setShowAnswer(false);
        setProgressStatus("analyzing");
        setProgress(undefined);
        try {
            const timeout = config?.timeouts?.analyze || 180000;
            const data = await apiClient.post<ParsedQuestion>("/api/practice/generate", {
                errorItemId,
                language,
                difficulty
            }, { timeout });

            setQuestions([{
                originalId: errorItemId,
                question: data,
                difficulty,
                userAnswer: "",
                notes: "",
                isSubmitted: false,
                isCorrect: null,
            }]);
        } catch (error: any) {
            console.error(error);
            const msg = error.data?.message || "";
            let errorMessage = t.practice.errors?.default || "Failed to generate";
            if (msg.includes('AI_CONNECTION_FAILED')) {
                errorMessage = t.errors?.aiConnectionFailed || errorMessage;
            } else if (msg.includes('AI_RESPONSE_ERROR')) {
                errorMessage = t.errors?.aiResponseError || errorMessage;
            } else if (msg.includes('AI_AUTH_ERROR')) {
                errorMessage = t.errors?.aiAuth || errorMessage;
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
            setProgressStatus("idle");
            setProgress(undefined);
        }
    };

    // 提交答案
    const submitAnswer = () => {
        if (isBatchMode) {
            const q = questions[currentIndex];
            if (!q || !q.userAnswer?.trim() || q.isSubmitted) return;

            const normalize = (str: string) => str.trim().toLowerCase().replace(/[.,;!]/g, '');
            const user = normalize(q.userAnswer);
            const correct = normalize(q.question.answerText);

            let isMatch = user === correct;
            if (!isMatch && /^[a-d]$/.test(user)) {
                isMatch = correct.startsWith(user);
            }
            if (!isMatch && correct.includes(user) && user.length > 1) {
                isMatch = true;
            }

            setQuestions(prev => {
                const newQuestions = [...prev];
                newQuestions[currentIndex] = {
                    ...q,
                    isSubmitted: true,
                    isCorrect: isMatch,
                };
                return newQuestions;
            });

            // 保存练习记录
            apiClient.post("/api/practice/record", {
                subject: q.question.subject || "Unknown",
                difficulty: q.difficulty,
                isCorrect: isMatch
            }).catch(err => console.error("Failed to save practice record:", err));
        } else {
            // 单题模式
            if (!userAnswer.trim() || !questions[0]?.question) return;

            setIsSubmitted(true);

            const normalize = (str: string) => str.trim().toLowerCase().replace(/[.,;!]/g, '');
            const user = normalize(userAnswer);
            const correct = normalize(questions[0].question.answerText);

            let isMatch = user === correct;
            if (!isMatch && /^[a-d]$/.test(user)) {
                isMatch = correct.startsWith(user);
            }
            if (!isMatch && correct.includes(user) && user.length > 1) {
                isMatch = true;
            }

            setIsCorrect(isMatch);
            setShowAnswer(true);

            apiClient.post("/api/practice/record", {
                subject: questions[0].question.subject || "Unknown",
                difficulty: questions[0].difficulty,
                isCorrect: isMatch
            }).catch(err => console.error("Failed to save practice record:", err));
        }
    };

    const saveQuestion = async (questionIndex: number) => {
        const targetQuestion = questions[questionIndex];
        if (!targetQuestion || targetQuestion.savedId || targetQuestion.isSaving) {
            return;
        }

        setQuestions((prev) => {
            const next = [...prev];
            next[questionIndex] = {
                ...targetQuestion,
                isSaving: true,
            };
            return next;
        });

        try {
            const saved = await apiClient.post<{ id: string }>("/api/practice/saved", {
                errorItemId: targetQuestion.originalId,
                difficulty: targetQuestion.difficulty,
                question: targetQuestion.question,
            });

            setQuestions((prev) => {
                const next = [...prev];
                next[questionIndex] = {
                    ...next[questionIndex],
                    savedId: saved.id,
                    isSaving: false,
                };
                return next;
            });
            alert(t.practice.saveSuccess || "练习题已保存！");
        } catch (error) {
            console.error("Failed to save practice question:", error);
            setQuestions((prev) => {
                const next = [...prev];
                next[questionIndex] = {
                    ...next[questionIndex],
                    isSaving: false,
                };
                return next;
            });
            alert(t.practice.saveFailed || "保存练习题失败，请重试。");
        }
    };

    // 更新批量模式下的答案
    const updateBatchAnswer = (value: string) => {
        setQuestions(prev => {
            const newQuestions = [...prev];
            if (newQuestions[currentIndex]) {
                newQuestions[currentIndex] = {
                    ...newQuestions[currentIndex],
                    userAnswer: value,
                };
            }
            return newQuestions;
        });
    };

    // 更新批量模式下的笔记
    const updateBatchNotes = (value: string) => {
        setQuestions(prev => {
            const newQuestions = [...prev];
            if (newQuestions[currentIndex]) {
                newQuestions[currentIndex] = {
                    ...newQuestions[currentIndex],
                    notes: value,
                };
            }
            return newQuestions;
        });
    };

    // 导航到上一题
    const goToPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    // 导航到下一题
    const goToNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    // 统计信息
    const submittedCount = questions.filter(q => q?.isSubmitted).length;
    const correctCount = questions.filter(q => q?.isCorrect).length;

    // 如果是无效请求
    if (!errorItemId && !isBatchMode) {
        return <div className="p-8 text-center">{t.practice.invalidRequest || "Invalid Request"}</div>;
    }

    // 渲染题目卡片
    const renderQuestionCard = (questionData: PracticeQuestion, questionIndex: number, isReadOnly = false) => {
        const q = questionData.question;
        const submitted = questionData.isSubmitted || isSubmitted;
        const correct = questionData.isCorrect !== undefined ? questionData.isCorrect : isCorrect;
        const answer = questionData.userAnswer !== undefined ? questionData.userAnswer : userAnswer;
        const notesText = questionData.notes !== undefined ? questionData.notes : notes;
        const showAns = submitted || showAnswer;

        return (
            <div className="space-y-6">
                <Card className="border-primary/50 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                            <span>{t.app.practiceProblem}</span>
                            {!isReadOnly && (
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                    <Button
                                        variant={questionData.savedId ? "secondary" : "outline"}
                                        size="sm"
                                        onClick={() => saveQuestion(questionIndex)}
                                        disabled={Boolean(questionData.savedId) || Boolean(questionData.isSaving)}
                                    >
                                        <BookmarkPlus className="mr-2 h-4 w-4" />
                                        {questionData.savedId
                                            ? (t.practice.savedQuestion || "已保存")
                                            : questionData.isSaving
                                                ? (t.practice.savingQuestion || "保存中...")
                                                : (t.practice.saveQuestion || "保存题目")}
                                    </Button>
                                    {!isBatchMode && (
                                        <>
                                    <select
                                        value={questionData.difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as any)}
                                        className="h-8 text-xs border rounded px-2 bg-background"
                                        disabled={loading}
                                    >
                                        <option value="easy">{t.practice.difficulty?.easy || "Easy"}</option>
                                        <option value="medium">{t.practice.difficulty?.medium || "Medium"}</option>
                                        <option value="hard">{t.practice.difficulty?.hard || "Hard"}</option>
                                        <option value="harder">{t.practice.difficulty?.harder || "Challenge"}</option>
                                    </select>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={generateQuestion}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {t.practice.generating}
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                                {t.practice.regenerate}
                                            </>
                                        )}
                                    </Button>
                                        </>
                                    )}
                                </div>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <MarkdownRenderer content={q.questionText} className="font-medium" />
                    </CardContent>
                </Card>

                {/* Answer Input Section */}
                {!isReadOnly && (
                    <Card className="border-blue-200">
                        <CardHeader>
                            <CardTitle className="text-blue-600">
                                {t.app.yourAnswer || "你的答案"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Input
                                placeholder={t.app.answerPlaceholder || "输入你的答案..."}
                                value={answer}
                                onChange={(e) => isBatchMode ? updateBatchAnswer(e.target.value) : setUserAnswer(e.target.value)}
                                disabled={submitted}
                                className="text-lg"
                            />
                            <Textarea
                                placeholder={t.app.notesPlaceholder || "记录解题思路（可选）..."}
                                value={notesText}
                                onChange={(e) => isBatchMode ? updateBatchNotes(e.target.value) : setNotes(e.target.value)}
                                disabled={submitted}
                                rows={3}
                            />
                        </CardContent>
                    </Card>
                )}

                {/* Submit/Result Section */}
                {!isReadOnly && !submitted ? (
                    <div className="flex justify-center">
                        <Button
                            size="lg"
                            onClick={submitAnswer}
                            disabled={!answer.trim()}
                            className="w-full md:w-auto"
                        >
                            <Send className="mr-2 h-4 w-4" />
                            {t.app.submitAnswer || "提交答案"}
                        </Button>
                    </div>
                ) : (submitted || isReadOnly) && correct !== null ? (
                    <Card className={correct ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3 mb-4">
                                {correct ? (
                                    <>
                                        <CheckCircle className="h-8 w-8 text-green-600" />
                                        <div>
                                            <h3 className="text-xl font-bold text-green-600">
                                                {t.practice.correct || "回答正确！"}
                                            </h3>
                                            <p className="text-green-700">
                                                {t.practice.correctMessage || "太棒了，继续保持！"}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-8 w-8 text-red-600" />
                                        <div>
                                            <h3 className="text-xl font-bold text-red-600">
                                                {t.practice.incorrect || "答案有误"}
                                            </h3>
                                            <p className="text-red-700">
                                                {t.practice.incorrectMessage || "再看看解析，加油！"}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                            {notesText && (
                                <div className="mt-4 p-3 bg-white rounded-lg border">
                                    <p className="text-sm font-medium text-gray-600 mb-1">
                                        {t.practice.yourNotes || "你的笔记："}
                                    </p>
                                    <p className="text-gray-700 whitespace-pre-wrap">{notesText}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : null}

                {showAns && (
                    <div className="space-y-6">
                        <Card className="bg-muted/50">
                            <CardHeader>
                                <CardTitle className="text-green-600">{t.practice.correctAnswer}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <MarkdownRenderer content={q.answerText} className="font-bold" />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t.practice.detailedAnalysis}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <MarkdownRenderer content={q.analysis} />
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <ProgressFeedback
                status={progressStatus}
                progress={progress}
                message={
                    generatingAll
                        ? (t.practice.generatingAll || `正在生成 (${currentIndex + 1}/${idsArray.length})`)
                        : (loading ? (t.practice.generating || "AI 正在出题...") : "")
                }
            />

            <div className="flex justify-between items-center mb-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t.common?.back || "返回"}
                </Button>
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <House className="h-5 w-5" />
                    </Button>
                </Link>
            </div>

            <div className="text-center space-y-4">
                <h1 className="text-3xl font-bold">
                    {isBatchMode ? (t.practice.batchTitle || "批量举一反三") : t.practice.title}
                </h1>
                <p className="text-muted-foreground">
                    {isBatchMode
                        ? (t.practice.batchSubtitle || `共 ${idsArray.length} 道题目，逐一练习`)
                        : t.practice.subtitle}
                </p>

                {/* 批量模式统计信息 */}
                {isBatchMode && questions.length > 0 && (
                    <div className="flex justify-center gap-4 flex-wrap">
                        <Badge variant="secondary">进度: {currentIndex + 1}/{questions.length}</Badge>
                        <Badge variant="secondary">已提交: {submittedCount}</Badge>
                        <Badge variant="default" className={correctCount > 0 ? "bg-green-500" : ""}>正确: {correctCount}</Badge>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <strong className="font-bold">{t.common?.error || "Error"}: </strong>
                        <span className="block whitespace-pre-wrap"> {error}</span>
                    </div>
                )}

                {/* 开始生成按钮 - 批量模式 */}
                {isBatchMode && questions.length === 0 && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg">
                            <span className="text-sm font-medium text-muted-foreground">{t.practice.difficulty?.label || "Difficulty"}:</span>
                            <div className="flex gap-1">
                                {[
                                    { value: "easy", label: t.practice.difficulty?.easy || "Easy", color: "bg-green-100 text-green-700 hover:bg-green-200" },
                                    { value: "medium", label: t.practice.difficulty?.medium || "Medium", color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
                                    { value: "hard", label: t.practice.difficulty?.hard || "Hard", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
                                    { value: "harder", label: t.practice.difficulty?.harder || "Challenge", color: "bg-red-100 text-red-700 hover:bg-red-200" }
                                ].map((level) => (
                                    <button
                                        key={level.value}
                                        onClick={() => setDifficulty(level.value as any)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${difficulty === level.value
                                                ? level.color.replace("bg-", "bg-opacity-100 bg-").replace("text-", "ring-2 ring-offset-1 ring-")
                                                : "bg-transparent hover:bg-muted text-muted-foreground"
                                            } ${difficulty === level.value ? level.color : ''}`}
                                    >
                                        {level.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button size="lg" onClick={generateAllQuestions} disabled={generatingAll}>
                            {generatingAll ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t.practice.generatingAll || `正在生成 (${currentIndex + 1}/${idsArray.length})`}
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {t.practice.generateAll || "开始生成所有题目"}
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* 单题模式 - 开始生成按钮 */}
                {!isBatchMode && questions.length === 0 && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg">
                            <span className="text-sm font-medium text-muted-foreground">{t.practice.difficulty?.label || "Difficulty"}:</span>
                            <div className="flex gap-1">
                                {[
                                    { value: "easy", label: t.practice.difficulty?.easy || "Easy", color: "bg-green-100 text-green-700 hover:bg-green-200" },
                                    { value: "medium", label: t.practice.difficulty?.medium || "Medium", color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
                                    { value: "hard", label: t.practice.difficulty?.hard || "Hard", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
                                    { value: "harder", label: t.practice.difficulty?.harder || "Challenge", color: "bg-red-100 text-red-700 hover:bg-red-200" }
                                ].map((level) => (
                                    <button
                                        key={level.value}
                                        onClick={() => setDifficulty(level.value as any)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${difficulty === level.value
                                                ? level.color.replace("bg-", "bg-opacity-100 bg-").replace("text-", "ring-2 ring-offset-1 ring-")
                                                : "bg-transparent hover:bg-muted text-muted-foreground"
                                            } ${difficulty === level.value ? level.color : ''}`}
                                    >
                                        {level.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button size="lg" onClick={generateQuestion} disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t.practice.generating}
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {t.practice.generate}
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>

            {/* 批量模式 - 题目导航 + 题目内容 */}
            {isBatchMode && questions.length > 0 && questions[currentIndex] && (
                <>
                    {/* 题目标签导航 */}
                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                        {questions.map((q, idx) => (
                            <Button
                                key={idx}
                                variant={idx === currentIndex ? "default" : "outline"}
                                size="sm"
                                className="w-10 h-10"
                                onClick={() => setCurrentIndex(idx)}
                            >
                                {idx + 1}
                                {q?.isSubmitted && (
                                    <CheckCircle className={`ml-1 h-3 w-3 ${q.isCorrect ? "text-green-400" : "text-red-400"}`} />
                                )}
                            </Button>
                        ))}
                    </div>

                    {/* 当前题目内容 */}
                    {renderQuestionCard(questions[currentIndex], currentIndex)}

                    {/* 上一题/下一题导航 */}
                    <div className="flex justify-between items-center pt-4">
                        <Button
                            variant="outline"
                            onClick={goToPrev}
                            disabled={currentIndex === 0}
                        >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            {t.practice.prevQuestion || "上一题"}
                        </Button>

                        <span className="text-muted-foreground">
                            {currentIndex + 1} / {questions.length}
                        </span>

                        <Button
                            variant="outline"
                            onClick={goToNext}
                            disabled={currentIndex === questions.length - 1}
                        >
                            {t.practice.nextQuestion || "下一题"}
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                </>
            )}

            {/* 单题模式 - 题目内容 */}
            {!isBatchMode && questions.length > 0 && questions[0] && (
                renderQuestionCard(questions[0], 0)
            )}
        </div>
    );
}

export default function PracticePage() {
    return (
        <main className="min-h-screen p-8 bg-background">
            <Suspense fallback={
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            }>
                <PracticeContent />
            </Suspense>
        </main>
    );
}
