"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type PracticeHistoryItem = {
  id: string;
  subject?: string;
  difficulty?: string;
  isCorrect?: boolean;
  questionText?: string;
  answerText?: string;
  analysis?: string;
  createdAt: string;
};

export default function PracticeHistoryPage() {
  const [items, setItems] = useState<PracticeHistoryItem[]>([]);

  useEffect(() => {
    apiClient.get<PracticeHistoryItem[]>("/api/practice/history").then(setItems).catch(console.error);
  }, []);

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">举一反三记录</h1>
        <Link href="/notebooks"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />返回</Button></Link>
      </div>
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle className="text-base">{item.subject || "Unknown"} · {item.difficulty || "medium"} · {new Date(item.createdAt).toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><b>题目：</b>{item.questionText}</p>
            <p><b>答案：</b>{item.answerText}</p>
            <p><b>解析：</b>{item.analysis}</p>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
