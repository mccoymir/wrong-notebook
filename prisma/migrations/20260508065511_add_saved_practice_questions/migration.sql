-- CreateTable
CREATE TABLE "SavedPracticeQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "errorItemId" TEXT,
    "questionText" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "subject" TEXT,
    "difficulty" TEXT,
    "knowledgePoints" TEXT,
    "requiresImage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedPracticeQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedPracticeQuestion_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavedPracticeQuestion_userId_createdAt_idx" ON "SavedPracticeQuestion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedPracticeQuestion_errorItemId_idx" ON "SavedPracticeQuestion"("errorItemId");
