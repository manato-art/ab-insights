-- CreateTable
CREATE TABLE "Admin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "abSystemUserId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "genre" TEXT,
    "subGenre" TEXT,
    "gender" TEXT,
    "ageGroup" TEXT,
    "platform" TEXT,
    "appealType" TEXT,
    "appealText" TEXT,
    "additionalNote" TEXT,
    "styleAxesJson" TEXT,
    "urlAnalysisSummary" TEXT,
    "promptFull" TEXT,
    "promptHash" TEXT,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "horizontallyExpanded" BOOLEAN NOT NULL DEFAULT false,
    "aiEdited" BOOLEAN NOT NULL DEFAULT false,
    "regeneratedCount" INTEGER NOT NULL DEFAULT 0,
    "hitScore" REAL
);

-- CreateTable
CREATE TABLE "EventImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" INTEGER NOT NULL,
    "imageIndex" INTEGER NOT NULL,
    "thumbnail" BLOB,
    "fullHash" TEXT,
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "aiEdited" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EventImage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventAiEdit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventAiEdit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenrePrompt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "genre" TEXT NOT NULL,
    "blockName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GenreInsight" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "genre" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "downloadRate" REAL,
    "expansionRate" REAL,
    "avgHitScore" REAL,
    "topAppealTypesJson" TEXT,
    "topStyleAxesJson" TEXT,
    "editKindStatsJson" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Event_genre_createdAt_idx" ON "Event"("genre", "createdAt");

-- CreateIndex
CREATE INDEX "Event_abSystemUserId_createdAt_idx" ON "Event"("abSystemUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_downloaded_horizontallyExpanded_idx" ON "Event"("downloaded", "horizontallyExpanded");

-- CreateIndex
CREATE INDEX "EventImage_eventId_idx" ON "EventImage"("eventId");

-- CreateIndex
CREATE INDEX "EventAiEdit_eventId_idx" ON "EventAiEdit"("eventId");

-- CreateIndex
CREATE INDEX "EventAiEdit_kind_idx" ON "EventAiEdit"("kind");

-- CreateIndex
CREATE INDEX "GenrePrompt_genre_enabled_priority_idx" ON "GenrePrompt"("genre", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "GenreInsight_genre_key" ON "GenreInsight"("genre");
